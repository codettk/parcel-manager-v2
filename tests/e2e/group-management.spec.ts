import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import {
  bootWithMockedApi,
  compositedFill,
  COMPOSITE_TOLERANCE,
  PARCEL_HEX,
  TAB_ID,
} from './helpers/mockApi'
import { findClickPoint, isNear, pixelAt } from './helpers/pixels'

// 명세: docs/specs/group-management.md — AC-11·12·13·14 (Playwright 소관은 이 4건)
// AC-1~10은 tests/unit/group/ 소관 (스토어 트랜잭션 + GroupSheet RTL).
// POST /api/tabs/:tabId/groups는 helpers/mockApi.ts에 200 ok로 모킹 —
// 본문·호출 횟수 검증은 이 spec이 waitForRequest와 요청 리코더로 수행한다.

// 엔진 보존 색상 (src/features/map/engine/colors.ts)
const PARCEL_FILL = { r: 255, g: 255, b: 255 } // 1차: 미지정 필지 채움 #FFFFFF — "그룹 생성 전" 기준색

const GROUP_NAME = 'E2E 그룹'
const GROUPS_PATH = `/api/tabs/${TAB_ID}/groups`

/** upsertGroupRequestSchema(src/types/api/tabState.ts) 동형 — 요청 본문 검증용 */
interface GroupUpsertBody {
  groupId: string
  group: {
    name: string | null
    memo: string | null
    color: string | null
    style: string
    parcelIds: string[]
  } | null
  clientId: string
}

function isGroupUpsert(req: Request): boolean {
  return req.method() === 'POST' && new URL(req.url()).pathname === GROUPS_PATH
}

function isParcelUpsert(req: Request): boolean {
  return (
    req.method() === 'POST' &&
    new URL(req.url()).pathname.startsWith(`/api/tabs/${TAB_ID}/parcels/`)
  )
}

/** 술어에 걸리는 요청 누적 — "호출 0건" 검증용 (waitForRequest는 부재를 증명하지 못한다) */
function trackRequests(page: Page, predicate: (req: Request) => boolean): Request[] {
  const records: Request[] = []
  page.on('request', (req) => {
    if (predicate(req)) records.push(req)
  })
  return records
}

/** 지점이 미지정 필지의 흰 채움인지 — 멀티선택 강조(6차)·원복의 캔버스 가시 신호 */
async function isWhiteAt(page: Page, point: { x: number; y: number }) {
  const px = await pixelAt(page, point)
  return px !== null && isNear(px, PARCEL_FILL, COMPOSITE_TOLERANCE)
}

/** 지점이 그룹 빨강 합성색(hexA 0.55)인지 — AC-12 저장 반영의 가시 신호 */
async function isRedCompositeAt(page: Page, point: { x: number; y: number }) {
  const px = await pixelAt(page, point)
  return px !== null && isNear(px, compositedFill(PARCEL_HEX), COMPOSITE_TOLERANCE)
}

/**
 * 멀티선택 토글 진입 후 서로 다른 미지정(흰 채움) 필지 2개를 탭한다.
 * 첫 탭의 6차 멀티선택 강조가 첫 필지 내부를 흰색→합성색으로 바꿀 때까지 기다린 뒤
 * 재스캔하므로, 두 번째 흰 지점은 반드시 다른 필지다 (parcel-sheet B-1-2 "선택 강조 후 재스캔" 패턴).
 * 스캔 지점은 margin 정사각형이 전부 순수 흰색 — "그룹 생성 전" 픽셀은 정확히 PARCEL_FILL이다.
 */
async function enterMultiSelectAndPickTwo(page: Page) {
  await page.getByRole('button', { name: '그룹 선택 모드' }).click()
  await expect(page.getByText('묶을 필지를 탭해서 선택하세요')).toBeVisible()

  const p1 = await findClickPoint(page, PARCEL_FILL, 2)
  expect(p1, '클릭 가능한 필지 내부 흰색 영역을 찾지 못함').not.toBeNull()
  if (!p1) throw new Error('unreachable')
  await page.mouse.click(p1.x, p1.y)
  // "1개 선택됨" = 비그룹 필지 1개가 개별 토글로 선택됐다는 가시 신호 (그룹이었다면 멤버 전체 합산)
  await expect(page.getByText('1개 선택됨')).toBeVisible()
  await expect.poll(() => isWhiteAt(page, p1), { timeout: 10_000 }).toBe(false)

  const p2 = await findClickPoint(page, PARCEL_FILL, 2)
  expect(p2, '두 번째 필지의 흰색 영역을 찾지 못함').not.toBeNull()
  if (!p2) throw new Error('unreachable')
  await page.mouse.click(p2.x, p2.y)
  await expect(page.getByText('2개 선택됨')).toBeVisible()

  return { p1, p2 }
}

/** AC-11 공통 전반부: 멀티선택 → 2개 탭 → FAB → pending 그룹 시트 열림 */
async function openPendingGroupSheet(page: Page) {
  const points = await enterMultiSelectAndPickTwo(page)
  await page.getByRole('button', { name: '그룹 만들기 (2필지)' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  return { ...points, sheet }
}

/** pending 시트에서 빨강 선택 + 이름 입력 + 저장 — 그룹 upsert POST 요청을 반환한다 */
async function saveRedPendingGroup(page: Page, sheet: Locator) {
  await sheet.getByRole('button', { name: '빨강' }).click()
  await sheet.getByLabel('그룹 이름').fill(GROUP_NAME)
  const upsertRequest = page.waitForRequest(isGroupUpsert)
  await sheet.getByRole('button', { name: '저장' }).click()
  return await upsertRequest
}

test('AC-11: 멀티선택 토글 → 배너 → 필지 2개 탭 → FAB → pending 그룹 시트가 열린다', async ({
  page,
}) => {
  await bootWithMockedApi(page)
  // 배너 문구 전이("묶을 필지를 탭해서 선택하세요" → "2개 선택됨")와 FAB 노출·탭은 헬퍼가 단계별 검증
  const { sheet } = await openPendingGroupSheet(page)

  // pending 시트: 헤더 메타 "그룹" + "2필지" 배지, 해체 자리 라벨은 "취소" (필지 추가 버튼 없음)
  await expect(sheet.getByText('그룹', { exact: true })).toBeVisible()
  await expect(sheet.getByText('2필지')).toBeVisible()
  await expect(sheet.getByRole('button', { name: '취소' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: '그룹 해체' })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: '필지 추가' })).toHaveCount(0)
})

test('AC-12: pending 시트에서 색+이름 저장 → 시트 닫힘 + 멤버 픽셀이 그룹색으로 + grp_ upsert 기록', async ({
  page,
}) => {
  await bootWithMockedApi(page)
  const groupPosts = trackRequests(page, isGroupUpsert)
  const { p1, p2, sheet } = await openPendingGroupSheet(page)

  const upsertRequest = await saveRedPendingGroup(page, sheet)

  // 본문: grp_ 접두 클라 생성 groupId + 멤버 2개 + draft 값 + clientId (에코 가드)
  const body = upsertRequest.postDataJSON() as GroupUpsertBody
  expect(body.groupId).toMatch(/^grp_/)
  expect(body.group).toMatchObject({ name: GROUP_NAME, color: 'c-red', style: 'fill' })
  expect(body.group?.parcelIds).toHaveLength(2)
  expect(new Set(body.group?.parcelIds).size).toBe(2)
  expect(typeof body.clientId).toBe('string')

  await expect(sheet).toBeHidden()
  await expect(page.getByTestId('sheet-backdrop')).toHaveCount(0)

  // 멤버 두 지점 모두 생성 전 흰 채움 → 그룹 빨강 합성색(hexA 0.55)으로 변한다
  await expect.poll(() => isRedCompositeAt(page, p1), { timeout: 10_000 }).toBe(true)
  await expect.poll(() => isRedCompositeAt(page, p2), { timeout: 10_000 }).toBe(true)

  // 커밋 = 영향 그룹 0 + 신규 1 — 그룹 upsert는 정확히 1회
  expect(groupPosts).toHaveLength(1)
})

test('AC-13: pending 시트에서 "취소" → 시트 닫힘 + 캔버스 픽셀 원상 + 그룹 upsert 0건', async ({
  page,
}) => {
  await bootWithMockedApi(page)
  const groupPosts = trackRequests(page, isGroupUpsert)
  const { p1, p2, sheet } = await openPendingGroupSheet(page)

  await sheet.getByRole('button', { name: '취소' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByTestId('sheet-backdrop')).toHaveCount(0)

  // 원복 — 두 지점 모두 생성 전과 동일한 순수 흰 채움으로 복귀 (스캔 시점 픽셀과 정확히 일치)
  await expect.poll(() => pixelAt(page, p1), { timeout: 10_000 }).toEqual(PARCEL_FILL)
  await expect.poll(() => pixelAt(page, p2), { timeout: 10_000 }).toEqual(PARCEL_FILL)

  // 드래프트 트랜잭션 취소 = 서버 호출 0회 (DB 무변경)
  expect(groupPosts).toHaveLength(0)
})

test('AC-14: 그룹 멤버 탭 → 그룹 시트 → 해체 → 픽셀 복귀 + group: null 전송 + 필지 upsert 없음', async ({
  page,
}) => {
  await bootWithMockedApi(page)
  const parcelPosts = trackRequests(page, isParcelUpsert)

  // Given: AC-12 흐름으로 그룹 생성·저장
  const { p1, sheet } = await openPendingGroupSheet(page)
  const createRequest = await saveRedPendingGroup(page, sheet)
  const { groupId } = createRequest.postDataJSON() as GroupUpsertBody
  await expect(sheet).toBeHidden()
  await expect(page.getByTestId('sheet-backdrop')).toHaveCount(0)
  await expect.poll(() => isRedCompositeAt(page, p1), { timeout: 10_000 }).toBe(true)

  // 멤버 탭 → 저장된 그룹의 시트 재열림 (비 pending: 이름이 저장값, 해체 라벨 "그룹 해체")
  await page.mouse.click(p1.x, p1.y)
  await expect(sheet).toBeVisible()
  await expect(sheet.getByLabel('그룹 이름')).toHaveValue(GROUP_NAME)
  const dissolveButton = sheet.getByRole('button', { name: '그룹 해체' })
  await expect(dissolveButton).toBeVisible()

  const dissolveRequest = page.waitForRequest(isGroupUpsert)
  await dissolveButton.click()

  // 해체 본문: 같은 groupId + group: null (행 삭제) + clientId
  const body = (await dissolveRequest).postDataJSON() as GroupUpsertBody
  expect(body.groupId).toBe(groupId)
  expect(body.group).toBeNull()
  expect(typeof body.clientId).toBe('string')

  await expect(sheet).toBeHidden()

  // 멤버 픽셀이 그룹 생성 전(흰 채움)으로 복귀 — 개별 override 무변경의 가시 신호
  await expect.poll(() => pixelAt(page, p1), { timeout: 10_000 }).toEqual(PARCEL_FILL)

  // 해체는 그룹 행 삭제만 — parcel_settings upsert 호출 0건 (명세 ⑥)
  expect(parcelPosts).toHaveLength(0)
})
