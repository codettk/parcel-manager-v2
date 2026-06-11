import { expect, test, type Page } from '@playwright/test'
import { bootWithMockedApi, type Rgb } from './helpers/mockApi'

// 명세: docs/specs/realtime-sync.md — AC-11 (Playwright 소관은 이 1건)
// AC-1~10은 tests/unit/lib/realtime.test.ts(클라이언트) +
// tests/integration/schema.test.ts·colors.test.ts(AC-7 서버 측) 소관.
//
// AC-11: supabase 키 없는 config(mockApi가 /api/config → {} 응답)에서
// initRealtime()이 disabled로 무해 종료해 부팅·지도 렌더·탭 선택이 정상이고
// 페이지 콘솔 에러가 0건임을 증명한다 — realtime 도입이 모킹 환경을 깨지 않는 회귀 가드.

// 엔진 보존 색상 (src/features/map/engine/colors.ts)
const PARCEL_FILL = { r: 255, g: 255, b: 255 } // 1차: 미지정 필지 채움 #FFFFFF
const SELECT_STROKE = { r: 31, g: 90, b: 56 } // 4차: 선택 강조 테두리 #1F5A38

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

test('AC-11: supabase 키 없는 mockApi 환경에서 부팅이 정상 완료되고 콘솔 에러가 0건이다', async ({
  page,
}) => {
  // 콘솔 에러·페이지 예외 수집 — goto 이전에 리스너를 걸어 부팅 전 과정을 포착한다
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => {
    consoleErrors.push(`pageerror: ${err.message}`)
  })

  // 부팅 완료 = 지도 정상 렌더 (override 빨강 합성 픽셀 출현까지 대기 포함).
  // 이 시점에 App 이펙트의 initRealtime()이 /api/config({})를 읽고 disabled로 종료했다.
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

  // realtime이 disabled로 무해 종료했음의 증명 — 콘솔 에러·미처리 예외 0건
  expect(consoleErrors).toEqual([])
})
