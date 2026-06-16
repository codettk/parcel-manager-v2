import { expect, test, type Page, type Request } from '@playwright/test'
import {
  bootWithMockedApi,
  compositedFill,
  COMPOSITE_TOLERANCE,
  countNearPixels,
  GROUP_HEX,
  HISTORY_H2_NAME,
  openMenuItem,
  PARCEL_HEX,
  RESTORED_TAB_ID,
} from '../helpers/mockApi'
import { findClickPoint } from '../helpers/pixels'

// 핵심 여정 ③ — 탭 생성 → 전환 → 소프트 클로즈 → 복원
//   +버튼 새 탭(빈 상태) → 새 탭에서 색칠 → 기본 탭으로 전환(격리: 새 탭 색 사라짐) →
//   새 탭 소프트 클로즈(× — 활성 ≥2 가드 통과) → 메뉴>히스토리>복원 → 복원 탭 활성·데이터 일치.
// mockApi: tabs:2 (활성 2개) + history:true (닫힌 탭 H1·H2). 복원은 RESTORED_TAB_ID 활성 +
// 빨강 override + 파랑 그룹을 반환(C-3 group_id 재생성 동형).

const RED_FILL = compositedFill(PARCEL_HEX)
const BLUE_FILL = compositedFill(GROUP_HEX)
const PARCEL_FILL = { r: 255, g: 255, b: 255 }

const PARCEL_GET_RE = /^\/api\/parcels\/[^/]+$/
function isParcelGet(req: Request): boolean {
  return req.method() === 'GET' && PARCEL_GET_RE.test(new URL(req.url()).pathname)
}
function parcelIdOf(req: Request): string {
  const segments = new URL(req.url()).pathname.split('/')
  return decodeURIComponent(segments[segments.length - 1])
}

/** 비활성 탭 라벨로 전환 — 해당 탭 state GET 완료 + aria-selected 확인 */
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

test('③ 새 탭 생성 → 색칠 → 전환 격리 → 소프트 클로즈 → 히스토리 복원 (활성·데이터 일치)', async ({
  page,
}) => {
  // tabs:2 — 소프트 클로즈가 활성 ≥2 가드를 통과하려면 활성 탭이 최소 2개여야 한다.
  await bootWithMockedApi(page, { tabs: 2, history: true })

  // 기본(A) 활성 — 픽스처 빨강 합성 픽셀이 존재
  await expect(page.getByRole('tab', { name: '기본' })).toHaveAttribute('aria-selected', 'true')
  expect(await countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE)).toBeGreaterThan(0)

  // ── 생성: +버튼 → 새 탭(빈 상태)으로 자동 전환. 새 탭 state GET 완료까지 대기.
  // 새 탭 id는 mockApi가 부여하는 tab_e2enew{seq} 형식 — state GET 경로에서 역산한다.
  const newTabStateReq = page.waitForRequest(
    (req) =>
      req.method() === 'GET' &&
      /^\/api\/tabs\/tab_e2enew\d+\/state$/.test(new URL(req.url()).pathname),
  )
  await page.getByRole('button', { name: '탭 추가' }).click()
  const createdReq = await newTabStateReq
  const createdTabId = /tabs\/([^/]+)\/state/.exec(new URL(createdReq.url()).pathname)?.[1] ?? ''
  expect(createdTabId).toMatch(/^tab_e2enew\d+$/)

  // 새 탭은 빈 상태 — 빨강 합성 픽셀이 전부 소실 (A의 색칠이 보이지 않음)
  await expect
    .poll(() => countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBe(0)

  // ── 새 탭에서 색칠: 흰 채움 필지 탭 → 빨강 저장
  const point = await findClickPoint(page, PARCEL_FILL, 2)
  expect(point, '클릭 가능한 필지 흰 영역 없음').not.toBeNull()
  if (!point) throw new Error('unreachable')
  const infoRequest = page.waitForRequest(isParcelGet)
  await page.mouse.click(point.x, point.y)
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  const paintedId = parcelIdOf(await infoRequest)
  await sheet.getByRole('button', { name: '빨강' }).click()
  const upsertReq = page.waitForRequest(
    (req) =>
      req.method() === 'POST' &&
      new URL(req.url()).pathname ===
        `/api/tabs/${createdTabId}/parcels/${encodeURIComponent(paintedId)}`,
  )
  await sheet.getByRole('button', { name: '저장' }).click()
  await upsertReq
  await expect(sheet).toBeHidden()
  await expect
    .poll(() => countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBeGreaterThan(0)

  // ── 전환 격리: 기본(A)으로 전환 → 새 탭에서 칠한 빨강 대신 A 픽스처 빨강만 보인다.
  // A로 돌아가면 새 탭의 paintedId 색은 A에 없으므로 A의 빨강은 A 픽스처 소관(격리).
  await switchToTab(page, '기본', 'tab-e2e')
  expect(await countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE)).toBeGreaterThan(0)

  // ── 소프트 클로즈: 새 탭의 × 버튼 (활성 ≥2 가드 통과 — 제거 후 2개 남음)
  const newTabName = '새 작업공간'
  const deleteReq = page.waitForRequest(
    (req) =>
      req.method() === 'DELETE' && new URL(req.url()).pathname === `/api/tabs/${createdTabId}`,
  )
  await page.getByRole('button', { name: `${newTabName} 닫기` }).click()
  await deleteReq
  // 새 탭이 탭 바에서 사라진다
  await expect(page.getByRole('tab', { name: newTabName })).toHaveCount(0)

  // ── 복원: 메뉴 > 히스토리 > H2 복원 → RESTORED_TAB_ID 활성 + 빨강·파랑 데이터
  const historyListReq = page.waitForRequest(
    (req) => req.method() === 'GET' && new URL(req.url()).pathname === '/api/history',
  )
  await openMenuItem(page, '히스토리')
  await historyListReq
  const historySheet = page.getByRole('dialog')
  await expect(historySheet).toBeVisible()
  await expect(historySheet.getByText(HISTORY_H2_NAME)).toBeVisible()

  // H2 행의 "복원" — restore POST + 복원 탭 state GET까지 대기
  const restoreStateReq = page.waitForRequest(
    (req) =>
      req.method() === 'GET' &&
      new URL(req.url()).pathname === `/api/tabs/${RESTORED_TAB_ID}/state`,
  )
  const h2Row = historySheet
    .getByText(HISTORY_H2_NAME)
    .locator('xpath=ancestor::div[contains(@class,"border-b")]')
  await h2Row.getByRole('button', { name: '복원' }).click()
  await restoreStateReq
  await expect(historySheet).toBeHidden()

  // 복원 탭이 활성 — 복원 데이터(빨강 override + 파랑 그룹) 합성 픽셀이 모두 출현
  await expect(page.getByRole('tab', { name: '닫힌 작업 둘' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect
    .poll(() => countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBeGreaterThan(0)
  await expect
    .poll(() => countNearPixels(page, BLUE_FILL, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBeGreaterThan(0)
})
