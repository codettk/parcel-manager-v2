import { expect, test, type Page } from '@playwright/test'
import { bootWithMockedApi, mockApi, type Rgb } from './helpers/mockApi'

// 명세: docs/specs/realtime-sync.md — AC-11 (Playwright 소관은 이 1건)
// AC-1~10은 tests/unit/lib/realtime.test.ts(클라이언트) +
// tests/integration/schema.test.ts·colors.test.ts(AC-7 서버 측) 소관.
//
// ── AC-11 재정의 (로그인 필수 슬라이스 — auth-accounts) ───────────────────────
// 원 AC-11은 "supabase 키 없는 config(/api/config → {}) → realtime disabled → 콘솔 에러 0건"을
// 지도 부팅에서 검증했다. 그러나 auth-accounts 슬라이스가 로그인을 첫 강제 관문으로 승격하면서
// 그 전제가 무효가 됐다:
//   - 키 없는 config → getSupabaseClient()=null → authStatus='anon' → LoginView만 렌더.
//     지도 부팅 자체가 불가하므로 "키 없음 + 지도 정상 렌더"는 구조적으로 모순이다.
//   - 지도에 도달하는 유일한 경로는 authed 세션 + supabase 구성이 내려온 환경이다.
//     이때 initRealtime()이 실제 supabase-js 클라이언트를 만들어 websocket을 연다 — E2E의
//     가짜 호스트(e2e-test.supabase.co)에는 실 서버가 없어 연결이 자연 실패한다.
//
// 재정의된 회귀 가드(realtime 도입이 부팅 경로를 깨지 않음)는 두 경로로 쪼갠다:
//   ① 무-키 경로: realtime은 boot 뒤에 걸려 있고 boot는 auth 뒤에 걸려 있다 → 무-키면
//      initRealtime이 아예 호출되지 않고 LoginView에 안착한다(앱 생존, 본문·websocket 미발생).
//   ② authed 경로: realtime websocket이 죽은 테스트 호스트로 실패해도 그 실패가 격리되어
//      지도 부팅·렌더·필지 탭(선택 강조)이 정상이다. websocket 연결 실패는 가짜 호스트의
//      불가피한 산물이므로 그 1건만 양성으로 허용하고, 그 외 콘솔 에러·미처리 예외는 0건이어야 한다.

// 엔진 보존 색상 (src/features/map/engine/colors.ts)
const PARCEL_FILL = { r: 255, g: 255, b: 255 } // 1차: 미지정 필지 채움 #FFFFFF
const SELECT_STROKE = { r: 31, g: 90, b: 56 } // 4차: 선택 강조 테두리 #1F5A38

const LOGIN_CTA = '카카오로 시작하기'

/** 가짜 supabase 호스트로의 realtime websocket 연결 실패 — authed E2E에서 불가피한 양성 */
function isBenignRealtimeWsError(text: string): boolean {
  return text.includes('e2e-test.supabase.co/realtime') && /websocket/i.test(text)
}

/** 메인 캔버스 백버퍼에서 지정 색과 정확히 일치하는 픽셀 수 (state-stores.spec.ts 패턴) */
function countExactPixels(page: Page, color: Rgb) {
  return page.evaluate(({ r, g, b }) => {
    const cv = document.querySelector('canvas')
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return 0
    const { data } = ctx.getImageData(0, 0, cv.width, cv.height)
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === r && data[i + 1] === g && data[i + 2] === b) count++
    }
    return count
  }, color)
}

/**
 * 캔버스 중앙 영역(x 15~70%, y 15~85%)에서 반경 margin 정사각형이 전부 target 색인
 * 클릭 지점을 찾는다 — 경계/안티앨리어싱 배제 (state-stores.spec.ts 패턴 재사용).
 */
function findClickPoint(page: Page, color: Rgb, margin: number) {
  return page.evaluate(
    ({ target, margin }) => {
      const cv = document.querySelector('canvas')
      const ctx = cv?.getContext('2d')
      if (!cv || !ctx) return null
      const { width, height } = cv
      const { data } = ctx.getImageData(0, 0, width, height)
      const matches = (x: number, y: number) => {
        const i = (y * width + x) * 4
        return data[i] === target.r && data[i + 1] === target.g && data[i + 2] === target.b
      }
      const x0 = Math.floor(width * 0.15)
      const x1 = Math.floor(width * 0.7)
      const y0 = Math.floor(height * 0.15)
      const y1 = Math.floor(height * 0.85)
      for (let y = y0 + margin; y < y1 - margin; y += 3) {
        for (let x = x0 + margin; x < x1 - margin; x += 3) {
          let uniform = true
          for (let dy = -margin; dy <= margin && uniform; dy++) {
            for (let dx = -margin; dx <= margin && uniform; dx++) {
              if (!matches(x + dx, y + dy)) uniform = false
            }
          }
          if (uniform) {
            const rect = cv.getBoundingClientRect()
            const dpr = width / rect.width
            return { x: rect.left + (x + 0.5) / dpr, y: rect.top + (y + 0.5) / dpr }
          }
        }
      }
      return null
    },
    { target: color, margin },
  )
}

test.describe('AC-11: realtime 도입이 로그인-필수 부팅 경로를 깨지 않는다', () => {
  test('무-키 config는 realtime을 기동하지 않고 LoginView에 안착한다 (앱 생존·본문 미노출)', async ({
    page,
  }) => {
    // 무-키면 realtime websocket 시도가 일절 없어야 한다 — initRealtime은 boot 뒤, boot는 auth 뒤.
    // (Vite HMR의 ws://localhost:5173 은 dev 서버 산물이라 제외 — supabase realtime ws만 센다)
    const consoleErrors: string[] = []
    const realtimeWsAttempts: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))
    page.on('websocket', (ws) => {
      if (ws.url().includes('/realtime/')) realtimeWsAttempts.push(ws.url())
    })

    // seedAuth:false → /api/config {} → getSupabaseClient()=null → authStatus='anon' → LoginView
    await mockApi(page, { seedAuth: false, seedRegion: false })
    await page.goto('/')

    // 로그인 화면만 — 지도·메뉴(본문) 미노출
    await expect(page.getByRole('button', { name: LOGIN_CTA })).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '메뉴' })).toHaveCount(0)

    // realtime은 supabase 클라이언트가 없어 아예 기동하지 않는다 — realtime websocket 시도 0건·콘솔 에러 0건
    expect(realtimeWsAttempts, '무-키 환경에서 realtime websocket 시도가 발생하면 안 된다').toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('authed 부팅에서 realtime websocket이 테스트 호스트로 실패해도 지도 부팅·필지 탭이 정상이다', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

    // bootWithMockedApi: seedAuth 기본 true → 가짜 supabase 구성으로 부팅 → 지도까지(override 합성 픽셀 대기).
    // 이 시점에 App 이펙트의 initRealtime()이 실 클라이언트를 만들어 websocket을 시도했고,
    // 가짜 호스트라 연결이 실패했으나 그 실패는 격리되어 부팅을 깨지 않았다.
    await bootWithMockedApi(page)

    // 부팅 후 상호작용도 정상 — 필지 탭 시 선택 강조(4차 패스)가 출현한다
    expect(await countExactPixels(page, SELECT_STROKE)).toBe(0)
    const parcelPoint = await findClickPoint(page, PARCEL_FILL, 2)
    expect(parcelPoint, '클릭 가능한 필지 내부 흰색 영역을 찾지 못함').not.toBeNull()
    if (!parcelPoint) return
    await page.mouse.click(parcelPoint.x, parcelPoint.y)
    await expect
      .poll(() => countExactPixels(page, SELECT_STROKE), { timeout: 10_000 })
      .toBeGreaterThan(0)

    // realtime 실패 격리 증명 — 가짜 호스트 websocket 실패 1건만 양성, 그 외 콘솔 에러·예외 0건
    const unexpected = consoleErrors.filter((e) => !isBenignRealtimeWsError(e))
    expect(unexpected, `예상 밖 콘솔 에러: ${JSON.stringify(unexpected)}`).toEqual([])
  })
})
