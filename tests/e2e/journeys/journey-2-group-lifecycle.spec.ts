import { expect, test, type Page, type Request } from '@playwright/test'
import {
  bootWithMockedApi,
  compositedFill,
  COMPOSITE_TOLERANCE,
  PARCEL_HEX,
  TAB_ID,
} from '../helpers/mockApi'
import { findClickPoint, isNear, pixelAt } from '../helpers/pixels'

// 핵심 여정 ② — 그룹 생성 → 해체 (전체 라이프사이클을 하나의 흐름으로)
//   멀티선택 진입 → 미지정 필지 2개 탭 → FAB로 pending 그룹 → 색·이름 저장 →
//   멤버 픽셀이 그룹색으로 → 멤버 탭해 그룹 시트 → 해체 → 멤버 픽셀 원상 복귀.
// mockApi: POST /api/tabs/:tabId/groups는 200 ok 모킹 — 본문은 waitForRequest로 검증.

const PARCEL_FILL = { r: 255, g: 255, b: 255 } // 미지정 필지 채움 #FFFFFF
const GROUP_NAME = '여정 그룹'
const GROUPS_PATH = `/api/tabs/${TAB_ID}/groups`

interface GroupUpsertBody {
  groupId: string
  group: { name: string | null; color: string | null; style: string; parcelIds: string[] } | null
  clientId: string
}

function isGroupUpsert(req: Request): boolean {
  return req.method() === 'POST' && new URL(req.url()).pathname === GROUPS_PATH
}

async function isWhiteAt(page: Page, point: { x: number; y: number }) {
  const px = await pixelAt(page, point)
  return px !== null && isNear(px, PARCEL_FILL, COMPOSITE_TOLERANCE)
}

async function isRedCompositeAt(page: Page, point: { x: number; y: number }) {
  const px = await pixelAt(page, point)
  return px !== null && isNear(px, compositedFill(PARCEL_HEX), COMPOSITE_TOLERANCE)
}

test('② 멀티선택으로 그룹 생성 → 멤버 색칠 확인 → 그룹 시트에서 해체 → 픽셀 원상복귀', async ({
  page,
}) => {
  await bootWithMockedApi(page)

  // ── 생성: 멀티선택 진입 → 미지정 필지 2개 탭
  await page.getByRole('button', { name: '그룹 선택 모드' }).click()
  await expect(page.getByText('묶을 필지를 탭해서 선택하세요')).toBeVisible()

  const p1 = await findClickPoint(page, PARCEL_FILL, 2)
  expect(p1, '첫 필지 흰 영역 없음').not.toBeNull()
  if (!p1) throw new Error('unreachable')
  await page.mouse.click(p1.x, p1.y)
  await expect(page.getByText('1개 선택됨')).toBeVisible()
  // 첫 필지가 선택 강조로 흰색→합성색이 되면 두 번째 흰 지점은 반드시 다른 필지
  await expect.poll(() => isWhiteAt(page, p1), { timeout: 10_000 }).toBe(false)

  const p2 = await findClickPoint(page, PARCEL_FILL, 2)
  expect(p2, '두 번째 필지 흰 영역 없음').not.toBeNull()
  if (!p2) throw new Error('unreachable')
  await page.mouse.click(p2.x, p2.y)
  await expect(page.getByText('2개 선택됨')).toBeVisible()

  // FAB → pending 그룹 시트
  await page.getByRole('button', { name: '그룹 만들기 (2필지)' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()

  // 색(빨강)·이름 저장 → grp_ 접두 클라 groupId + 멤버 2개 + clientId
  await sheet.getByRole('button', { name: '빨강' }).click()
  await sheet.getByLabel('그룹 이름').fill(GROUP_NAME)
  const createRequest = page.waitForRequest(isGroupUpsert)
  await sheet.getByRole('button', { name: '저장' }).click()
  const createBody = (await createRequest).postDataJSON() as GroupUpsertBody
  expect(createBody.groupId).toMatch(/^grp_/)
  expect(createBody.group).toMatchObject({ name: GROUP_NAME, color: 'c-red', style: 'fill' })
  expect(createBody.group?.parcelIds).toHaveLength(2)
  expect(typeof createBody.clientId).toBe('string')
  const createdGroupId = createBody.groupId

  await expect(sheet).toBeHidden()

  // 멤버 두 지점 모두 흰색→그룹 빨강 합성색
  await expect.poll(() => isRedCompositeAt(page, p1), { timeout: 10_000 }).toBe(true)
  await expect.poll(() => isRedCompositeAt(page, p2), { timeout: 10_000 }).toBe(true)

  // ── 해체: 멤버 탭 → 저장된 그룹 시트(이름이 저장값) → "그룹 해체"
  await page.mouse.click(p1.x, p1.y)
  await expect(sheet).toBeVisible()
  await expect(sheet.getByLabel('그룹 이름')).toHaveValue(GROUP_NAME)

  const dissolveRequest = page.waitForRequest(isGroupUpsert)
  await sheet.getByRole('button', { name: '그룹 해체' }).click()
  const dissolveBody = (await dissolveRequest).postDataJSON() as GroupUpsertBody
  // 같은 groupId + group: null (행 삭제)
  expect(dissolveBody.groupId).toBe(createdGroupId)
  expect(dissolveBody.group).toBeNull()

  await expect(sheet).toBeHidden()

  // 멤버 픽셀이 그룹 생성 전(순수 흰 채움)으로 복귀 — 개별 override 무변경의 가시 신호
  await expect.poll(() => pixelAt(page, p1), { timeout: 10_000 }).toEqual(PARCEL_FILL)
  await expect.poll(() => pixelAt(page, p2), { timeout: 10_000 }).toEqual(PARCEL_FILL)
})
