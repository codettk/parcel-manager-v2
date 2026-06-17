import { expect, test, type Page } from '@playwright/test'
import {
  bootWithMockedApi,
  compositedFill,
  COMPOSITE_TOLERANCE,
  countNearPixels,
  mockApi,
  openMenuItem,
  PARCEL_HEX,
  REGIONS_CATALOG_FIXTURE,
  SAMPLE_REGION_ID,
  SEED_REGION_ID,
  UPCOMING_REGION_ID,
} from './helpers/mockApi'

// 전국 지적도 데이터 파이프라인 — 다중 region (docs/specs/national-data-pipeline.md)
//
// E2E 대상: AC-2·5·6·12·13·14·15·16·17 (클라이언트 카탈로그 소비·region별 지도 로딩·
// 받기/제거 UI·진입 게이트 회귀). AC와 test() 1:1 매핑.
//
// 통합테스트 위임 (E2E 중복 금지 — 명세 지시):
//   AC-1 (GET /api/regions 200·zod 검증·공개)        → tests/integration/regions.test.ts
//   AC-3 (import:parcels 보구곶 region_id 멱등 백필)  → tests/unit/import-parcels.test.ts
//   AC-4 (샘플 region 멱등 적재·local_id PK 격리)     → tests/integration/regions.test.ts
//   AC-7 (POST acquire → mine 포함)                    → tests/integration/regions.test.ts
//   AC-8 (loaded=false acquire 409)                    → tests/integration/regions.test.ts
//   AC-9 (DELETE remove → mine 제거·parcels 무영향)    → tests/integration/regions.test.ts
//   AC-10 (무인증 mutate 401)                          → tests/integration/regions.test.ts
//   AC-11 (사용자별 서버 영속·기기 독립)               → tests/integration/regions.test.ts
//
// 부팅 순서(로그인→region→지도)는 mockApi가 재현: seedAuth(인증 게이트 통과) +
// seedRegion(활성 region 주입 여부). 받기/제거는 인증 세션 필수라 seedAuth 기본값(true)에 의존한다.

// region 카탈로그·지도 데이터 — mockApi 픽스처에서 도출 (하드코딩 회피)
const SEED_DISPLAY = REGIONS_CATALOG_FIXTURE.find((r) => r.id === SEED_REGION_ID)!.displayName
const SAMPLE_DISPLAY = REGIONS_CATALOG_FIXTURE.find((r) => r.id === SAMPLE_REGION_ID)!.displayName
const UPCOMING_DISPLAY = REGIONS_CATALOG_FIXTURE.find((r) => r.id === UPCOMING_REGION_ID)!.displayName

const LOADED_COUNT = REGIONS_CATALOG_FIXTURE.filter((r) => r.loaded).length // 2
const UPCOMING_COUNT = REGIONS_CATALOG_FIXTURE.filter((r) => !r.loaded).length // 1
// 클라이언트 더미(SEED_CATALOG)는 5개(적재 2 + 준비중 3)다. 서버 카탈로그(3개)와 분류 수가
// 달라야 "서버 소비 vs 더미" 구별이 가능 — 준비중 1개로 settle하면 서버 응답을 보고 있는 것.

/** 첫(메인) 캔버스의 빨강 override 합성 픽셀 수 — 보구곶 데이터 렌더 신호 */
function redPixels(page: Page) {
  return countNearPixels(page, compositedFill(PARCEL_HEX), COMPOSITE_TOLERANCE)
}

/** 첫 draw(style.width 설정) 완료까지 대기 — region 전환 후 재진입 포함 */
async function waitFirstDraw(page: Page) {
  await page.waitForFunction(() => {
    const cv = document.querySelector('canvas')
    return cv !== null && cv.style.width !== ''
  })
}

// ── AC-2: 서버 카탈로그 소비 (적재/준비중 수 1:1) ───────────────────────────────

test.describe('AC-2 — 서버 카탈로그 소비', () => {
  test('AC-2: region 선택 화면의 적재(활성)/준비중 수가 GET /api/regions 응답의 loaded 분류와 1:1 일치', async ({
    page,
  }) => {
    // 게이트 화면을 보려면 활성 region 미주입 — 첫 진입(AC-15 동형) 상태
    await mockApi(page, { seedRegion: false })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '지역 선택' })).toBeVisible()

    // 서버 카탈로그가 settle하면 "준비 중" 칩이 정확히 UPCOMING_COUNT(1)개여야 한다.
    // 클라이언트 더미(준비중 3)였다면 1로 줄지 않는다 — 서버 소비를 분류 수로 결정적 검증.
    await expect.poll(() => page.getByText('준비 중', { exact: true }).count()).toBe(UPCOMING_COUNT)

    // 적재(활성) region 행 — 두 적재 region의 displayName이 모두 노출 (준비중과 합쳐 총 3행)
    await expect(page.getByRole('button', { name: SEED_DISPLAY, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: SAMPLE_DISPLAY, exact: true })).toBeVisible()

    // 적재 region은 "준비 중"이 아니다 — 받기/사용중 액션을 가진다 (loaded 분류 1:1)
    const loadedCatalog = REGIONS_CATALOG_FIXTURE.filter((r) => r.loaded)
    expect(loadedCatalog).toHaveLength(LOADED_COUNT)
    for (const r of loadedCatalog) {
      const row = page.getByRole('button', { name: r.displayName, exact: true })
      await expect(row.getByText('준비 중')).toHaveCount(0)
    }
  })
})

// ── AC-5: 보구곶 활성 진입 시 보구곶 지적도 렌더 (슬라이스 1 회귀 0) ────────────

test.describe('AC-5 — 보구곶 지도 렌더 회귀', () => {
  test('AC-5: 보구곶 활성 진입 시 지도에 보구곶 지적도(parcels.json)가 렌더된다', async ({ page }) => {
    // bootWithMockedApi = 활성 region(보구곶) 주입 + 빨강 합성 픽셀(>0) poll까지 완료.
    // 이 헬퍼 통과 자체가 보구곶 데이터 로딩→렌더(region 스코프 로딩 전환 후 회귀 0)의 증거다.
    await bootWithMockedApi(page)
    await expect(page.locator('canvas').first()).toBeVisible()
    // 현재 region 칩이 보구곶 — region 스코프 로딩 경로가 보구곶 데이터를 가리킨다
    await expect(
      page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` }),
    ).toBeVisible()
    // 보구곶 override(RED_PARCEL_ID) 합성 픽셀이 렌더됨 — 정확한 데이터셋 확인
    expect(await redPixels(page)).toBeGreaterThan(0)
  })
})

// ── AC-6: 활성 region 단위 지도 데이터 교체 ────────────────────────────────────

test.describe('AC-6 — region별 지도 데이터 교체', () => {
  test('AC-6: 샘플 region으로 전환 시 보구곶이 아닌 샘플 데이터가 렌더되고, 보구곶 복귀 시 다시 보구곶', async ({
    page,
  }) => {
    // 보구곶으로 부팅(빨강 픽셀 출현) — 기준 상태
    await bootWithMockedApi(page)
    expect(await redPixels(page)).toBeGreaterThan(0)

    // 샘플 region 받기+전환: 칩 → 선택 화면 → 샘플 받기(낙관) → 전환
    await page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` }).click()
    await expect(page.getByRole('heading', { name: '지역 선택' })).toBeVisible()
    // 미보유 적재 region은 "받기" 버튼(available) — 탭하면 받기 후 전환
    await page.getByRole('button', { name: `${SAMPLE_DISPLAY} 받기` }).click()

    // 샘플 지도로 전환 — 캔버스 재진입. 샘플(36필지)엔 보구곶 override 필지가 없어 빨강 픽셀이 사라진다.
    await expect(page.locator('canvas').first()).toBeVisible()
    await waitFirstDraw(page)
    await expect(
      page.getByRole('button', { name: `현재 지역 ${SAMPLE_DISPLAY}` }),
    ).toBeVisible()
    // 데이터셋 교체 검증: 보구곶 빨강 합성 픽셀이 0으로 소멸 (샘플 데이터엔 RED_PARCEL_ID 부재)
    await expect.poll(() => redPixels(page), { timeout: 15_000 }).toBe(0)

    // 보구곶 복귀 — 다시 보구곶 데이터 → 빨강 픽셀 재출현
    await page.getByRole('button', { name: `현재 지역 ${SAMPLE_DISPLAY}` }).click()
    await page.getByRole('button', { name: SEED_DISPLAY, exact: true }).click()
    await waitFirstDraw(page)
    await expect(
      page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` }),
    ).toBeVisible()
    await expect.poll(() => redPixels(page), { timeout: 15_000 }).toBeGreaterThan(0)
  })
})

// ── AC-12: 미보유 적재 region 받기(낙관) → 전환·렌더 ───────────────────────────

test.describe('AC-12 — 받기 후 전환', () => {
  test('AC-12: 준비 중이 아닌 미보유 region 탭 → 받기(낙관 추가) → 그 region으로 전환·지도 렌더', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    // 선택 화면 진입 — 샘플은 아직 미보유라 "받기"(available) 상태
    await page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` }).click()
    const acquireBtn = page.getByRole('button', { name: `${SAMPLE_DISPLAY} 받기` })
    await expect(acquireBtn).toBeVisible()

    // 받기 동작 수행 — 낙관적 추가 후 전환
    await acquireBtn.click()

    // 받은 뒤 샘플 region으로 전환되어 지도가 샘플 데이터로 렌더된다
    await expect(page.locator('canvas').first()).toBeVisible()
    await waitFirstDraw(page)
    await expect(
      page.getByRole('button', { name: `현재 지역 ${SAMPLE_DISPLAY}` }),
    ).toBeVisible()
    // 보구곶이 아닌 샘플 데이터 — 보구곶 override 픽셀 부재
    await expect.poll(() => redPixels(page), { timeout: 15_000 }).toBe(0)

    // 받은 목록 영속(낙관) 확인 — 관리 화면에 샘플이 받은 region으로 등장
    await openMenuItem(page, '지역 관리')
    await expect(page.getByRole('heading', { name: '지역 관리' })).toBeVisible()
    await expect(page.getByRole('button', { name: SAMPLE_DISPLAY, exact: true })).toBeVisible()
  })
})

// ── AC-13: 지역 관리 — 비활성 region 제거 ─────────────────────────────────────

test.describe('AC-13 — 비활성 region 제거', () => {
  test('AC-13: 받은 region 2+개에서 비활성 region 제거(⋮→ConfirmInline 2단계) → 목록에서 사라지고 활성 유지', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    // 받은 목록 2개 만들기: 보구곶(활성·시드) + 샘플(받기). 활성은 보구곶 유지.
    await page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` }).click()
    await page.getByRole('button', { name: `${SAMPLE_DISPLAY} 받기` }).click()
    // 받기는 샘플로 전환한다 — 보구곶을 다시 활성으로 되돌려 "비활성=샘플"을 만든다
    await waitFirstDraw(page)
    await page.getByRole('button', { name: `현재 지역 ${SAMPLE_DISPLAY}` }).click()
    await page.getByRole('button', { name: SEED_DISPLAY, exact: true }).click()
    await waitFirstDraw(page)

    await openMenuItem(page, '지역 관리')
    await expect(page.getByRole('heading', { name: '지역 관리' })).toBeVisible()
    // 받은 region 2개 — 보구곶(사용 중) + 샘플(비활성)
    await expect(page.getByRole('button', { name: SEED_DISPLAY, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: SAMPLE_DISPLAY, exact: true })).toBeVisible()

    // 비활성(샘플) ⋮ 더보기 → 제거 ConfirmInline 2단계
    await page.getByRole('button', { name: `${SAMPLE_DISPLAY} 더보기` }).click()
    await page.getByRole('button', { name: '지역 제거' }).click() // 1단계
    await page.getByRole('button', { name: '제거', exact: true }).click() // 2단계 확정

    // 샘플이 목록에서 사라지고 활성(보구곶)은 그대로 유지
    await expect(page.getByRole('button', { name: SAMPLE_DISPLAY, exact: true })).toHaveCount(0)
    const seedCard = page.getByRole('button', { name: SEED_DISPLAY, exact: true })
    await expect(seedCard).toBeVisible()
    await expect(seedCard.getByText('사용 중')).toBeVisible()
  })
})

// ── AC-14: 활성 region 제거 가드 ──────────────────────────────────────────────

test.describe('AC-14 — 활성 region 제거 가드', () => {
  test('AC-14: 활성 region에는 제거 affordance가 없어(가드) 제거가 불가능하고 빈 지도가 발생하지 않는다', async ({
    page,
  }) => {
    // 받은 region 2개(보구곶 활성 + 샘플 비활성)를 만들어 "활성만 제거 차단"을 형제 대비로 검증.
    // 가드 메커니즘(구현): 비활성 region만 ⋮ 더보기(제거 진입)를 노출하고, 활성 region은
    // CircleCheck("사용 중")만 노출해 제거 경로 자체가 없다 → 빈 지도(활성 소실)가 구조적으로 차단.
    await bootWithMockedApi(page)
    await page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` }).click()
    await page.getByRole('button', { name: `${SAMPLE_DISPLAY} 받기` }).click()
    await waitFirstDraw(page)
    // 받기는 샘플로 전환한다 — 보구곶을 다시 활성으로 되돌려 "활성=보구곶, 비활성=샘플"을 만든다
    await page.getByRole('button', { name: `현재 지역 ${SAMPLE_DISPLAY}` }).click()
    await page.getByRole('button', { name: SEED_DISPLAY, exact: true }).click()
    await waitFirstDraw(page)

    await openMenuItem(page, '지역 관리')
    await expect(page.getByRole('heading', { name: '지역 관리' })).toBeVisible()

    // 활성(보구곶) — "사용 중" 배지 + 제거 affordance 부재(⋮ 더보기 없음 = 제거 진입 불가)
    const seedCard = page.getByRole('button', { name: SEED_DISPLAY, exact: true })
    await expect(seedCard.getByText('사용 중')).toBeVisible()
    await expect(page.getByRole('button', { name: `${SEED_DISPLAY} 더보기` })).toHaveCount(0)

    // 대조: 비활성(샘플)에는 제거 진입(⋮ 더보기)이 존재한다 — 가드가 활성에만 적용됨을 확인
    await expect(page.getByRole('button', { name: `${SAMPLE_DISPLAY} 더보기` })).toBeVisible()

    // 관리 화면을 나가면 활성(보구곶) 지도로 복귀해 빈 상태가 아니다 — 빈 지도 방지 가드의 결과
    await page.getByRole('button', { name: '뒤로' }).click()
    await waitFirstDraw(page)
    await expect(page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` })).toBeVisible()
    await expect.poll(() => redPixels(page), { timeout: 15_000 }).toBeGreaterThan(0)
  })
})

// ── AC-15: 진입 게이트 회귀 — 첫 진입(region 미기록) ──────────────────────────

test.describe('AC-15 — 첫 진입 게이트', () => {
  test('AC-15: localStorage 마지막 region 미기록 + 로그인 완료 → 부팅 후 지역 선택 화면(지도/탭바 미표시)', async ({
    page,
  }) => {
    // seedAuth(기본 true)로 로그인 완료, seedRegion:false로 마지막 region 미기록
    await mockApi(page, { seedRegion: false })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '지역 선택' })).toBeVisible()
    // 지도 캔버스·탭바(메뉴)가 보이지 않는다
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '메뉴' })).toHaveCount(0)
  })
})

// ── AC-16: 진입 게이트 회귀 — 영속 region 직행 ───────────────────────────────

test.describe('AC-16 — 영속 region 직행', () => {
  test('AC-16: 보구곶 1회 선택해 localStorage 기록 후 새로고침 → 지역 선택 건너뛰고 보구곶 지도 직행', async ({
    page,
  }) => {
    // bootWithMockedApi = 활성 region(보구곶) 영속 주입 = 이미 1회 선택한 사용자 동형
    await bootWithMockedApi(page)
    await expect(page.getByRole('heading', { name: '지역 선택' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '메뉴' })).toBeVisible()

    // 실제 새로고침 — 영속 키가 게이트를 건너뛰고 보구곶 지도로 직행
    await page.reload()
    await waitFirstDraw(page)
    await expect(page.getByRole('heading', { name: '지역 선택' })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: `현재 지역 ${SEED_DISPLAY}` }),
    ).toBeVisible()
    await expect.poll(() => redPixels(page), { timeout: 15_000 }).toBeGreaterThan(0)
  })
})

// ── AC-17: 준비 중(loaded=false) region 탭 → 토스트·지도 미전환·받기 미발생 ────

test.describe('AC-17 — 준비 중 region', () => {
  test('AC-17: 준비 중 region 탭 → "준비 중" 안내(토스트), 지도 미전환·받기 미발생', async ({
    page,
  }) => {
    await mockApi(page, { seedRegion: false })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '지역 선택' })).toBeVisible()
    // 서버 카탈로그 settle 대기 (준비중 1개)
    await expect.poll(() => page.getByText('준비 중', { exact: true }).count()).toBe(UPCOMING_COUNT)

    // 준비 중(강화읍) region 행 — 탭(받기 버튼 없음, 행 본문 탭)
    const upcoming = page.getByRole('button', { name: UPCOMING_DISPLAY, exact: true })
    await expect(upcoming).toBeVisible()
    await expect(upcoming.getByText('준비 중')).toBeVisible()
    await upcoming.click()

    // "준비 중" 안내 토스트가 뜨고 지도로 전환되지 않으며(캔버스 부재) 게이트가 유지된다
    await expect(page.getByText(/아직 준비 중이에요/)).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '지역 선택' })).toBeVisible()
    // 받기 미발생 — 준비 중 행에 "받는 중"·"받기" 액션이 트리거되지 않는다(준비중 배지 유지)
    await expect(upcoming.getByText('준비 중')).toBeVisible()
  })
})
