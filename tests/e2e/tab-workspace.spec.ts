import { expect, test, type Page, type Request } from '@playwright/test'
import {
  bootWithMockedApi,
  compositedFill,
  COMPOSITE_TOLERANCE,
  countNearPixels,
  PARCEL_HEX,
  TAB_B_ID,
  TAB_ID,
} from './helpers/mockApi'
import { findClickPoint } from './helpers/pixels'

// 명세: docs/specs/tab-workspace.md
// E2E 소관: AC-1 (탭 격리 — 픽셀). AC-2~8은 RTL/스토어 단위(tests/unit/tab·stores),
// AC-9(C-1 realtime 첫 탭 폴백)는 Realtime 이벤트 모킹이라 E2E로 강제하지 않고
// tests/unit/lib/realtime.test.ts("AC-8: 활성 탭 원격 닫힘 — 첫 탭 폴백")가 등가 검증한다
// (refetchTabs가 활성탭 소실 시 setActiveTab(첫 탭)). AC-10~12는 통합 회귀 게이트.
//
// /api 모킹·부팅 대기는 helpers/mockApi.ts 공용. opts.tabs:2로 활성 탭 2개(A=기본 픽스처,
// B=빈 상태)를 띄우고, 탭 스코프 tabState가 탭 id별 분기·POST upsert per-tab 반영되도록 모킹했다.

const RED_FILL = compositedFill(PARCEL_HEX)

const PARCEL_GET_RE = /^\/api\/parcels\/[^/]+$/

function isParcelGet(req: Request): boolean {
  return req.method() === 'GET' && PARCEL_GET_RE.test(new URL(req.url()).pathname)
}

function parcelIdOf(req: Request): string {
  const segments = new URL(req.url()).pathname.split('/')
  return decodeURIComponent(segments[segments.length - 1])
}

/** 탭 라벨로 비활성 탭 전환 — 전환 후 해당 탭의 tabState.get(state) 완료까지 대기 */
async function switchToTab(page: Page, label: string, tabId: string) {
  const stateRequest = page.waitForRequest(
    (req) =>
      req.method() === 'GET' &&
      new URL(req.url()).pathname === `/api/tabs/${encodeURIComponent(tabId)}/state`,
  )
  await page.getByRole('tab', { name: label }).click()
  await stateRequest
  await expect(page.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true')
}

test('AC-1: 탭 A에서 색칠된 필지 P가 탭 B에는 색이 없고, A로 돌아오면 P 색이 복원된다', async ({
  page,
}) => {
  // tabs:2 — A(TAB_ID, 기본 픽스처: RED_PARCEL_ID=c-red 색칠) + B(TAB_B_ID, 빈 상태).
  // 부팅 신호(빨강 합성 픽셀 출현)가 A 활성 + P 색칠을 동시에 보장한다.
  await bootWithMockedApi(page, { tabs: 2 })

  // Given: A 활성 — P의 빨강 합성 픽셀이 캔버스에 존재
  await expect(page.getByRole('tab', { name: '기본' })).toHaveAttribute('aria-selected', 'true')
  expect(await countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE)).toBeGreaterThan(0)

  // When: 탭 B로 전환 → B는 빈 상태라 P의 빨강 합성 픽셀이 전부 소실 (탭 격리)
  await switchToTab(page, '두번째', TAB_B_ID)
  await expect
    .poll(() => countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBe(0)

  // Then: A로 복귀 → P의 빨강 색이 복원된다 (A의 override는 보존됨)
  await switchToTab(page, '기본', TAB_ID)
  await expect
    .poll(() => countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBeGreaterThan(0)
})

test('AC-1 (쓰기 격리): 탭 B에서 필지를 색칠하면 탭 A에는 나타나지 않고 B 재진입 시 유지된다', async ({
  page,
}) => {
  await bootWithMockedApi(page, { tabs: 2 })

  // 탭 B로 전환(빈 상태) — 흰 채움 필지를 탭해 색을 칠한다
  await switchToTab(page, '두번째', TAB_B_ID)
  await expect
    .poll(() => countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBe(0)

  // 미지정(흰 채움) 필지 탭 → ParcelSheet 열림. 탭된 필지 id는 단건 조회로 역산
  const PARCEL_FILL = { r: 255, g: 255, b: 255 }
  const point = await findClickPoint(page, PARCEL_FILL, 2)
  expect(point, '클릭 가능한 필지 내부 흰색 영역을 찾지 못함').not.toBeNull()
  if (!point) throw new Error('unreachable')
  const infoRequest = page.waitForRequest(isParcelGet)
  await page.mouse.click(point.x, point.y)
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  const paintedId = parcelIdOf(await infoRequest)

  // 색 '빨강' 선택 후 저장 — upsert POST가 B(TAB_B_ID)에 persist되어야 한다
  await sheet.getByRole('button', { name: '빨강' }).click()
  const upsertPath = `/api/tabs/${TAB_B_ID}/parcels/${encodeURIComponent(paintedId)}`
  const upsertRequest = page.waitForRequest(
    (req) => req.method() === 'POST' && new URL(req.url()).pathname === upsertPath,
  )
  await sheet.getByRole('button', { name: '저장' }).click()
  await upsertRequest
  await expect(sheet).toBeHidden()

  // B에 빨강 합성 픽셀이 나타난다 (방금 색칠)
  await expect
    .poll(() => countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBeGreaterThan(0)

  // 탭 A로 전환 → A 픽스처의 빨강(RED_PARCEL_ID)은 A 소관. B에서 색칠한 필지(paintedId)는
  // A에 없으므로 A의 빨강 픽셀 수는 B에서 색칠한 만큼 늘지 않는다 — 격리 검증은 다음 round-trip이 확정한다
  await switchToTab(page, '기본', TAB_ID)

  // B로 재진입 → B에서 색칠한 빨강이 유지된다 (per-tab persist)
  await switchToTab(page, '두번째', TAB_B_ID)
  await expect
    .poll(() => countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBeGreaterThan(0)
})
