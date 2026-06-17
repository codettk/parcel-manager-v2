import { expect, test } from '@playwright/test'
import {
  bootWithMockedApi,
  compositedFill,
  COMPOSITE_TOLERANCE,
  countNearPixels,
  mockApi,
  openMenuItem,
  PARCEL_HEX,
} from './helpers/mockApi'

// 필지 리브랜딩 + 전국 지적도 지역 선택 진입 (docs/specs/region-entry.md)
// AC ↔ test 1:1. 게이트 동작(AC-4~11)은 region 미주입(seedRegion:false) 빈 상태로 시작하고,
// 지도 직행이 전제인 AC(8/10)는 주입 후 검증한다. 리브랜딩(AC-1~3)은 e2e 가능 범위만.

const SEED_DISPLAY = '인천 강화군 화도면(보구곶)'
const SEED_SHORT = '화도면(보구곶)'
const BRAND_BLUE = { r: 0x2c, g: 0x5f, b: 0xd0 } // #2C5FD0
const OLD_GREEN = { r: 0x2f, g: 0x7d, b: 0x4f } // #2f7d4f

/** rgb(...) 문자열 → 채널 배열 */
function parseRgb(value: string): [number, number, number] {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value)
  if (m === null) throw new Error(`색 파싱 실패: ${value}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

// ── 리브랜딩 (AC-1~3) ────────────────────────────────────────────────────────

test.describe('리브랜딩', () => {
  test('AC-2: 문서 title이 "필지"를 포함하고 "보구곶리"를 포함하지 않는다', async ({ page }) => {
    // 게이트 화면이든 지도든 문서 title은 동일 — 주입 없이 가장 단순한 경로로 검증
    await mockApi(page, { seedRegion: false })
    await page.goto('/')
    const title = await page.title()
    expect(title).toContain('필지')
    expect(title).not.toContain('보구곶리')
  })

  test('AC-3: --color-primary 토큰이 브랜드 블루(#2C5FD0)이고 기존 녹색(#2f7d4f)이 아니다', async ({
    page,
  }) => {
    await mockApi(page, { seedRegion: false })
    await page.goto('/')
    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
    )
    // 토큰 hex 직접 단언 + 실제 렌더 요소(CTA)의 계산색이 블루(녹색 아님)인지 교차 검증
    expect(primary.toLowerCase()).toBe('#2c5fd0')

    // 게이트 화면의 GPS CTA(bg-primary) 배경이 블루로 적용됐는지 — 토큰→픽셀 적용 확인
    const cta = page.getByRole('button', { name: /현재 위치로 시작|위치 확인 중/ })
    await expect(cta).toBeVisible()
    const swatch = cta.locator('span[aria-hidden].bg-primary').first()
    const bg = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor)
    const [r, g, b] = parseRgb(bg)
    expect(Math.abs(r - BRAND_BLUE.r)).toBeLessThanOrEqual(4)
    expect(Math.abs(g - BRAND_BLUE.g)).toBeLessThanOrEqual(4)
    expect(Math.abs(b - BRAND_BLUE.b)).toBeLessThanOrEqual(4)
    // 기존 녹색이 아님
    const greenDist =
      Math.abs(r - OLD_GREEN.r) + Math.abs(g - OLD_GREEN.g) + Math.abs(b - OLD_GREEN.b)
    expect(greenDist).toBeGreaterThan(30)
  })

  test('AC-1: 앱 메뉴 드로어 어디에도 "보구곶리"·"영농" 문구가 없고 브랜드 정체성이 "필지"다', async ({
    page,
  }) => {
    // 메뉴는 지도 진입 후에만 존재 — region 주입 후 부팅
    await bootWithMockedApi(page)
    await page.getByRole('button', { name: '메뉴' }).click()
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('보구곶리')
    // 브랜드 정체성 가드: 앱이 "영농" 도구로 비치면 안 된다. 단 슬라이스 5a가 도입한
    // 사후 승인 "영농 PRO" 섹션 라벨(PRO 콘텐츠 분류, 브랜드 정체성 아님)은 허용한다 —
    // 그 라벨을 제거한 나머지 본문에 "영농"이 없으면 브랜드 정체성 가드는 유지된다.
    expect(body.replaceAll('영농 PRO', '')).not.toContain('영농')
    // title(문서 브랜드)에 "필지" — 카피 브랜드 정체성 확인 (화면 텍스트가 필지 서비스임)
    expect(await page.title()).toContain('필지')
  })
})

// ── 지역 선택 진입 게이트 (AC-4~7) ──────────────────────────────────────────

test.describe('지역 선택 진입 게이트', () => {
  test('AC-4: 첫 방문(region 기록 없음)이면 "지역 선택" 화면이 뜨고 지도·탭바가 없다', async ({
    page,
  }) => {
    await mockApi(page, { seedRegion: false })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '지역 선택' })).toBeVisible()
    // 지도 캔버스·탭바 부재
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '메뉴' })).toHaveCount(0)
  })

  test('AC-5: "화도" 검색 → 보구곶 항목(활성) 표시, 탭하면 지도로 전환되고 필지가 렌더된다', async ({
    page,
  }) => {
    await mockApi(page, { seedRegion: false })
    await page.goto('/')
    await page.getByRole('textbox', { name: '지역 검색' }).fill('화도')

    // 슬라이스 3: 적재·미보유 region 행은 본문 버튼(displayName)과 "받기" 버튼(displayName+받기)이
    // 접두를 공유 → 행 본문은 exact:true로 지정해 strict-mode 충돌을 피한다
    const row = page.getByRole('button', { name: SEED_DISPLAY, exact: true })
    await expect(row).toBeVisible()
    // 활성(데이터 적재) 표시 — "준비 중"이 아니어야 한다 (받기 가능 = 적재됨)
    await expect(page.getByRole('button', { name: `${SEED_DISPLAY} 받기` })).toBeVisible()

    await row.click()

    // 지도 전환 — 캔버스 출현 + 첫 draw + 빨강 override 합성 픽셀(부팅 완료 신호)
    await expect(page.locator('canvas').first()).toBeVisible()
    await page.waitForFunction(() => {
      const cv = document.querySelector('canvas')
      return cv !== null && cv.style.width !== ''
    })
    await expect
      .poll(() => countNearPixels(page, compositedFill(PARCEL_HEX), COMPOSITE_TOLERANCE), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0)
  })

  test('AC-6: 데이터 미적재 행정구역 탭 → "준비 중" 안내 표시, 지도로 전환 안 됨', async ({
    page,
  }) => {
    await mockApi(page, { seedRegion: false })
    await page.goto('/')
    // 미적재 region(강화읍 등)을 검색으로 노출시켜 탭 — 결과 행에 "준비 중" 칩이 있어야 한다
    await page.getByRole('textbox', { name: '지역 검색' }).fill('강화읍')
    const upcoming = page.getByRole('button', { name: /인천 강화군 강화읍/ })
    await expect(upcoming).toBeVisible()
    await expect(upcoming.getByText('준비 중')).toBeVisible()

    await upcoming.click()

    // "준비 중" 안내가 뜨고 지도(캔버스)는 여전히 없으며 게이트가 유지된다
    await expect(page.getByText(/준비 중이에요/)).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '지역 선택' })).toBeVisible()
  })

  test('AC-7: GPS 권한 거부 시 폴백 안내가 뜨고 앱이 살아 있어 검색 경로가 계속 가능', async ({
    page,
  }) => {
    await mockApi(page, { seedRegion: false })
    // geolocation을 항상 에러(권한 거부)로 호출하도록 주입 — denied 분기 유발
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_ok: PositionCallback, err?: PositionErrorCallback) => {
            err?.({ code: 1, message: 'denied' } as GeolocationPositionError)
          },
        },
      })
    })
    await page.goto('/')

    await page.getByRole('button', { name: /현재 위치로 시작|위치 확인 중/ }).click()
    // 폴백 안내 표시 (앱 미중단 — 게이트 화면 유지)
    await expect(page.getByText(/위치 권한을 확인할 수 없어요/)).toBeVisible()
    await expect(page.getByRole('heading', { name: '지역 선택' })).toBeVisible()

    // 검색 경로 계속 사용 가능 — 화도 검색 후 진입 (행 본문은 exact:true — 받기 버튼과 접두 공유)
    await page.getByRole('textbox', { name: '지역 검색' }).fill('화도')
    const row = page.getByRole('button', { name: SEED_DISPLAY, exact: true })
    await expect(row).toBeVisible()
    await row.click()
    await expect(page.locator('canvas').first()).toBeVisible()
  })
})

// ── 지역 전환 / 지도 지역칩 (AC-8~11) ──────────────────────────────────────

test.describe('지역 전환 / 지도 지역칩', () => {
  test('AC-8: 보구곶 region 진입 후 지도 상단에 현재 region 명을 표시하는 지역칩이 보인다', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    const chip = page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` })
    await expect(chip).toBeVisible()
    await expect(chip.getByText(SEED_SHORT)).toBeVisible()
  })

  test('AC-9: 지역칩 탭 → 지역 선택 화면이 다시 열려 전환 진입점이 제공된다', async ({ page }) => {
    await bootWithMockedApi(page)
    await page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` }).click()
    // 게이트 화면 재진입 — 다른 지역 검색/선택 가능
    await expect(page.getByRole('heading', { name: '지역 선택' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '지역 검색' })).toBeVisible()
    // 칩으로 재진입한 경우엔 닫기(X) 노출 — 진입점이지 강제 게이트가 아님
    await expect(page.getByRole('button', { name: '닫기' })).toBeVisible()
  })

  test('AC-10: region을 한 번 선택해 영속된 상태면 새로고침 시 게이트 없이 지도로 직행', async ({
    page,
  }) => {
    // bootWithMockedApi가 region을 주입(= 이미 영속된 사용자) — 새로고침 동형
    await bootWithMockedApi(page)
    // 게이트 화면이 아니라 곧바로 지도(지역칩·메뉴)가 보인다
    await expect(page.getByRole('button', { name: '메뉴' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '지역 선택' })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` }),
    ).toBeVisible()

    // 실제 새로고침 후에도 동일 — 영속 키가 게이트를 건너뛴다
    await page.reload()
    await page.waitForFunction(() => {
      const cv = document.querySelector('canvas')
      return cv !== null && cv.style.width !== ''
    })
    await expect(page.getByRole('heading', { name: '지역 선택' })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` }),
    ).toBeVisible()
  })

  test('AC-11: 메뉴 "지역 관리" → 받은 지역 목록에 보구곶이 있고 전환 가능', async ({ page }) => {
    await bootWithMockedApi(page)
    await openMenuItem(page, '지역 관리')

    await expect(page.getByRole('heading', { name: '지역 관리' })).toBeVisible()
    // 받은(적재) 지역 목록에 보구곶 — 사용 중 배지(현재 region)
    const seedCard = page.getByRole('button', { name: SEED_DISPLAY })
    await expect(seedCard).toBeVisible()
    await expect(seedCard.getByText('사용 중')).toBeVisible()

    // 각 항목에서 전환 가능 — 보구곶 항목 탭 시 지도로 복귀(전환 성공)
    await seedCard.click()
    await expect(page.getByRole('heading', { name: '지역 관리' })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` }),
    ).toBeVisible()
  })
})
