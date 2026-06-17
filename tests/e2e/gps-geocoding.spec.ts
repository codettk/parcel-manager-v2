import { expect, test, type Page } from '@playwright/test'
import {
  compositedFill,
  COMPOSITE_TOLERANCE,
  countNearPixels,
  mockApi,
  PARCEL_HEX,
  REGIONS_CATALOG_FIXTURE,
  SEED_REGION_ID,
  UPCOMING_REGION_ID,
  type MockApiOptions,
} from './helpers/mockApi'

// GPS 역지오코딩 — 좌표→행정구역→region 자동 선택 (docs/specs/gps-geocoding.md)
//
// E2E 대상 = AC-9·10·11·12·13(GPS 동선 매칭 3분기 + 권한/에러 분기). 각 AC = test() 1개.
// 위임(E2E 중복 금지):
//   - AC-1~5(역지오코딩 프록시): tests/integration/geocode.test.ts
//   - AC-6~8(region 매칭 순수 함수): tests/unit/region/matchRegion.test.ts
//
// GPS 동선은 region 미선택 첫 진입(지역 선택 게이트)에서 발생한다 → seedRegion:false.
// 인증 게이트(슬라이스 2)는 기본 시드(seedAuth!==false)로 통과시켜 LoginView를 건너뛴다
// → 역지오코딩 프록시 requireUser 게이트(절충 4)도 항상 세션 보유 상태로 동선이 막히지 않는다.
//
// navigator.geolocation은 addInitScript로 주입한다(region-entry AC-7 선례 — 결정적이고
// mockApi의 init script seam과 동일 계열). 역지오코딩 응답은 opts.geocode로 모킹.

// region 카탈로그 픽스처에서 행정구역명을 도출한다(id 하드코딩 회피 — 카탈로그 변화에 견고).
const SEED_REGION = REGIONS_CATALOG_FIXTURE.find((r) => r.id === SEED_REGION_ID)
const UPCOMING_REGION = REGIONS_CATALOG_FIXTURE.find((r) => r.id === UPCOMING_REGION_ID)
if (SEED_REGION === undefined || UPCOMING_REGION === undefined)
  throw new Error('REGIONS_CATALOG_FIXTURE에 SEED/UPCOMING region 누락 (e2e)')

/** 매칭+loaded(보구곶) 행정구역 — AC-9 추천 카드 분기 */
const SEED_AREA = { sido: SEED_REGION.sido, sigungu: SEED_REGION.sigungu, emd: SEED_REGION.emd }
/** 보구곶 행 본문 버튼명(displayName) — 추천 카드·검색 결과 행 공용 셀렉터 */
const SEED_DISPLAY = SEED_REGION.displayName
/** 매칭+준비중(강화읍) 행정구역 — AC-10 분기② */
const UPCOMING_AREA = {
  sido: UPCOMING_REGION.sido,
  sigungu: UPCOMING_REGION.sigungu,
  emd: UPCOMING_REGION.emd,
}
/** 카탈로그에 없는 행정구역 — AC-11 무매칭 분기③ */
const UNMATCHED_AREA = { sido: '서울특별시', sigungu: '종로구', emd: '청운동' }

/**
 * navigator.geolocation.getCurrentPosition을 좌표 성공으로 주입(부팅 전).
 * 좌표 값 자체는 무의미(역지오코딩 응답이 opts.geocode로 모킹되므로) — 성공 콜백 호출만 보장한다.
 */
async function grantGeolocation(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) => {
          ok({
            coords: {
              longitude: 126.41,
              latitude: 37.65,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition)
        },
      },
    })
  })
}

/** navigator.geolocation 권한 거부(code:1)로 주입 — 역지오코딩 호출 이전 분기(AC-12) */
async function denyGeolocation(page: Page) {
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
}

/**
 * geolocation 미지원으로 주입 — unsupported 분기(AC-12).
 * useGpsLocate는 `'geolocation' in navigator`로 분기하므로 속성 자체를 삭제해야 한다
 * (undefined 할당으로는 `in`이 true라 getCurrentPosition 접근에서 TypeError).
 */
async function removeGeolocation(page: Page) {
  await page.addInitScript(() => {
    // geolocation은 Navigator.prototype 접근자다 → 거기서 삭제해야 `'geolocation' in navigator`가 false.
    // 미지원 브라우저(navigator.geolocation === undefined, in 검사 false)를 정확히 모사한다.
    const proto = Object.getPrototypeOf(navigator) as object
    delete (proto as { geolocation?: unknown }).geolocation
    if ('geolocation' in navigator) {
      delete (navigator as { geolocation?: unknown }).geolocation
    }
  })
}

/** 지역 선택 게이트 화면에서 시작 — region·auth 시드를 동선에 맞게 강제하고 게이트 렌더 대기 */
async function bootGate(page: Page, opts: MockApiOptions) {
  await mockApi(page, { ...opts, seedRegion: false })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '지역 선택' })).toBeVisible()
}

const gpsCard = (page: Page) =>
  page.getByRole('button', { name: /현재 위치로 시작|위치 확인 중/ })

/** 검색 폴백이 살아 있는지 — 검색 입력 사용 가능 + 게이트 유지(앱 미중단) 공통 단언 */
async function expectSearchFallbackAlive(page: Page) {
  await expect(page.getByRole('heading', { name: '지역 선택' })).toBeVisible()
  const search = page.getByRole('textbox', { name: '지역 검색' })
  await expect(search).toBeEnabled()
  await search.fill('화도')
  await expect(
    page.getByRole('button', { name: SEED_DISPLAY, exact: true }),
  ).toBeVisible()
}

// ── AC-9: 매칭 + loaded → 추천 카드 → 탭 → 지도 진입 ──────────────────────────

test('AC-9: 보구곶 행정구역 매칭 → "현재 위치 추천" 카드 → 탭하면 지도로 전환되어 필지 렌더', async ({
  page,
}) => {
  await grantGeolocation(page)
  await bootGate(page, { geocode: { area: SEED_AREA } })

  await gpsCard(page).click()

  // 매칭+loaded → 추천 카드(보구곶 region 행) + "현재 위치 추천" 부제.
  // 기본 지역 목록에도 같은 displayName 행이 있으므로 부제 텍스트로 추천 카드만 특정한다.
  await expect(page.getByText('현재 위치 추천')).toBeVisible()
  const recommend = page
    .getByRole('button', { name: SEED_DISPLAY, exact: true })
    .filter({ hasText: '현재 위치 추천' })
  await expect(recommend).toBeVisible()

  await recommend.click()

  // 슬라이스 3 받기/전환 재사용 → 지도 전환: 캔버스 출현 + 첫 draw + 빨강 override 합성 픽셀(부팅 완료)
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
  // 게이트는 닫혔다
  await expect(page.getByRole('heading', { name: '지역 선택' })).toHaveCount(0)
})

// ── AC-10: 매칭 + 준비중(loaded=false) → 안내, 지도 미전환·받기 미발생 ──────────

test('AC-10: 준비 중 region 행정구역 매칭 → "준비 중" 안내, 지도 미전환·받기 미발생', async ({
  page,
}) => {
  await grantGeolocation(page)
  // 받기(acquire) 호출이 발생하면 즉시 실패시켜 "받기 미발생"을 적극 검증한다
  let acquireCalled = false
  await bootGate(page, { geocode: { area: UPCOMING_AREA } })
  await page.route(
    (url) => /\/api\/regions\/[^/]+\/acquire$/.test(url.pathname),
    (route) => {
      acquireCalled = true
      return route.fulfill({ status: 500, json: { error: 'acquire가 호출되면 안 됨 (AC-10)' } })
    },
  )

  await gpsCard(page).click()

  // 분기② 안내 — shortName(강화읍)이 들어간 "준비 중" 안내.
  // (구현은 준비중 region에도 RegionRow를 렌더하지만 "준비 중" 상태라 탭해도 토스트만 — 받기·전환 없음.
  //  AC-10의 본질은 준비중 안내·지도 미전환·받기 미발생이므로 추천 카드 유무는 단언하지 않는다.)
  await expect(
    page.getByText(`현재 위치는 ${UPCOMING_REGION.shortName}인데 아직 준비 중이에요`),
  ).toBeVisible()

  // 지도 미전환 — 캔버스 없음, 게이트 유지
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '지역 선택' })).toBeVisible()
  expect(acquireCalled).toBe(false)
})

// ── AC-11: 무매칭 → 검색 폴백 안내, 보구곶 자동 추천 없음 ────────────────────

test('AC-11: 카탈로그에 없는 행정구역 → "검색으로 골라 주세요" 안내, 보구곶 자동 추천 없음, 검색 사용 가능', async ({
  page,
}) => {
  await grantGeolocation(page)
  await bootGate(page, { geocode: { area: UNMATCHED_AREA } })

  await gpsCard(page).click()

  // 분기③ 무매칭 안내
  await expect(
    page.getByText('현재 위치에 해당하는 지역이 아직 없어요. 검색으로 골라 주세요.'),
  ).toBeVisible()
  // 보구곶 자동 추천 없음 — "현재 위치 추천" 카드 부재. (검색 결과 행이 아닌 추천 카드만 판정)
  await expect(page.getByText('현재 위치 추천')).toHaveCount(0)
  // 지도 미전환
  await expect(page.locator('canvas')).toHaveCount(0)
  // 검색 폴백 사용 가능 — 검색 시에만 보구곶 행이 노출되어 진입 가능
  await expectSearchFallbackAlive(page)
})

// ── AC-12: 권한 거부 / 미지원 → 권한 안내 + 검색 폴백 (슬라이스 1 회귀 보존) ──────

test('AC-12a: 위치 권한 거부 → "위치 권한을 확인할 수 없어요" 안내 + 검색 폴백, 역지오코딩 미호출', async ({
  page,
}) => {
  await denyGeolocation(page)
  // 역지오코딩이 호출되면 실패시킨다 — 권한 분기는 외부 호출 이전(절충 4)이므로 호출되면 안 됨
  let geocodeCalled = false
  await bootGate(page, {})
  await page.route(
    (url) => url.pathname === '/api/geocode/reverse',
    (route) => {
      geocodeCalled = true
      return route.fulfill({ status: 500, json: { error: '권한 거부 시 호출 금지 (AC-12)' } })
    },
  )

  await gpsCard(page).click()

  await expect(page.getByText('위치 권한을 확인할 수 없어요')).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
  expect(geocodeCalled).toBe(false)
  // 검색 폴백 계속 가능 (슬라이스 1 AC-7 회귀)
  await expectSearchFallbackAlive(page)
})

test('AC-12b: geolocation 미지원 → 동일한 권한 안내 + 검색 폴백', async ({ page }) => {
  await removeGeolocation(page)
  await bootGate(page, {})

  await gpsCard(page).click()

  await expect(page.getByText('위치 권한을 확인할 수 없어요')).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
  await expectSearchFallbackAlive(page)
})

// ── AC-13: 역지오코딩 503/502 실패 → 실패 안내 + 검색 폴백, 자동 추천 없음 ─────

test('AC-13a: 역지오코딩 503(키 부재) → "위치를 확인하지 못했어요" 실패 안내 + 검색 폴백, 자동 추천 없음', async ({
  page,
}) => {
  await grantGeolocation(page)
  await bootGate(page, { geocode: { status: 503 } })

  await gpsCard(page).click()

  await expect(page.getByText('위치를 확인하지 못했어요')).toBeVisible()
  // 보구곶 자동 추천 없음 + 지도 미전환 (앱 미중단)
  await expect(page.getByText('현재 위치 추천')).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveCount(0)
  await expectSearchFallbackAlive(page)
})

test('AC-13b: 역지오코딩 502(외부 실패) → 동일한 실패 안내 + 검색 폴백', async ({ page }) => {
  await grantGeolocation(page)
  await bootGate(page, { geocode: { status: 502 } })

  await gpsCard(page).click()

  await expect(page.getByText('위치를 확인하지 못했어요')).toBeVisible()
  await expect(page.getByText('현재 위치 추천')).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveCount(0)
  await expectSearchFallbackAlive(page)
})
