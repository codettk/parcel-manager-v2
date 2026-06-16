import { expect, test, type Request } from '@playwright/test'
import {
  bootWithMockedApi,
  CALC_RECIPE_FIXTURE,
  compositedFill,
  COMPOSITE_TOLERANCE,
  GROUP_HEX,
  GROUP_MEMBER_IDS,
  jibunOf,
  openMenuItem,
} from '../helpers/mockApi'
import { findClickPoint } from '../helpers/pixels'

// 핵심 여정 ⑥ — 계산기 개별/그룹 (하나의 흐름으로)
//   설정에서 레시피 시작 → 모드 배지 → 비그룹 필지 탭(개별 결과) →
//   그룹 멤버 탭(그룹 전체 결과) → 개별 지번 전환(재계산) → 종료.
// 환산 근거(단건 조회 면적 1234.5㎡, 레시피 300㎡당 20kg):
//   개별 (1234.5/300)×20 = 82.3 kg · 그룹(멤버 2) 2469㎡ → (2469/300)×20 = 164.6 kg

const PARCEL_FILL = { r: 255, g: 255, b: 255 } // 미지정(비그룹) 필지 채움 #FFFFFF
const BADGE_TEXT = '계산기 모드 — 필지를 탭하세요'

const PARCEL_GET_RE = /^\/api\/parcels\/[^/]+$/
function isParcelGet(req: Request): boolean {
  return req.method() === 'GET' && PARCEL_GET_RE.test(new URL(req.url()).pathname)
}
function parcelIdOf(req: Request): string {
  const segments = new URL(req.url()).pathname.split('/')
  return decodeURIComponent(segments[segments.length - 1])
}

test('⑥ 계산기 시작 → 비그룹 개별 결과 → 그룹 전체 결과 → 개별 지번 전환 재계산', async ({
  page,
}) => {
  // 저장된 레시피(석회 300㎡당 20kg)로 부팅 — 설정 시트는 GET 최신화 행을 그대로 보여준다
  await bootWithMockedApi(page, { calcRecipes: [CALC_RECIPE_FIXTURE] })

  // ── 설정 → 계산 시작
  await openMenuItem(page, '자동 계산기')
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByLabel('자재명')).toHaveValue('석회')
  await sheet.getByRole('button', { name: '계산 시작' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText(BADGE_TEXT)).toBeVisible()

  // ── 개별: 비그룹(흰 채움) 필지 탭 → 결과 시트 직행, 개별 환산값 82.3 kg
  const whitePoint = await findClickPoint(page, PARCEL_FILL, 2)
  expect(whitePoint, '비그룹 흰 영역 없음').not.toBeNull()
  if (!whitePoint) throw new Error('unreachable')
  const indivInfo = page.waitForRequest(isParcelGet)
  await page.mouse.click(whitePoint.x, whitePoint.y)
  await expect(sheet).toBeVisible()
  const indivId = parcelIdOf(await indivInfo)
  await expect(sheet.getByText('계산 결과')).toBeVisible()
  const indivJibun = jibunOf(indivId)
  expect(indivJibun, `개별 필지(${indivId}) 지번 없음`).not.toBeNull()
  await expect(sheet.getByRole('heading', { name: indivJibun ?? '' })).toBeVisible()
  await expect(sheet.getByText('1,234.5 ㎡')).toBeVisible()
  await expect(sheet.getByText('82.3 kg')).toBeVisible()
  // 비그룹 — 개별/그룹 토글 없음
  await expect(sheet.getByRole('button', { name: '개별 지번' })).toHaveCount(0)

  // 개별 결과 시트 닫기 — 계산기 모드는 유지(배지 그대로). 모바일 BottomSheet backdrop가
  // 캔버스 탭을 가리므로 다음 그룹 멤버 탭 전에 시트를 닫아야 한다.
  await sheet.getByRole('button', { name: '닫기' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText(BADGE_TEXT)).toBeVisible()

  // ── 그룹: 그룹 멤버(파랑 합성) 탭 → 그룹 전체 결과(2,469㎡ → 164.6 kg)
  const bluePoint = await findClickPoint(
    page,
    compositedFill(GROUP_HEX),
    2,
    0.7,
    COMPOSITE_TOLERANCE,
  )
  expect(bluePoint, '그룹 파랑 합성 영역 없음').not.toBeNull()
  if (!bluePoint) throw new Error('unreachable')
  const groupInfo = page.waitForRequest(isParcelGet)
  await page.mouse.click(bluePoint.x, bluePoint.y)
  await expect(sheet).toBeVisible()
  const tappedId = parcelIdOf(await groupInfo)
  expect(GROUP_MEMBER_IDS).toContain(tappedId)

  await expect(sheet.getByRole('button', { name: '그룹 전체 (2필지)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(sheet.getByRole('heading', { name: '파랑 그룹' })).toBeVisible()
  await expect(sheet.getByText('2,469 ㎡')).toBeVisible()
  await expect(sheet.getByText('164.6 kg')).toBeVisible()

  // ── 개별 지번 전환 → 탭된 멤버 면적(1234.5㎡) 기준 즉시 재계산 (82.3 kg)
  await sheet.getByRole('button', { name: '개별 지번' }).click()
  await expect(sheet.getByRole('button', { name: '개별 지번' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const memberJibun = jibunOf(tappedId)
  expect(memberJibun, `멤버(${tappedId}) 지번 없음`).not.toBeNull()
  await expect(sheet.getByRole('heading', { name: memberJibun ?? '' })).toBeVisible()
  await expect(sheet.getByText('1,234.5 ㎡')).toBeVisible()
  await expect(sheet.getByText('82.3 kg')).toBeVisible()
  await expect(sheet.getByText('164.6 kg')).toHaveCount(0)

  // ── 종료 → 모드·결과 시트 소멸
  await page.getByRole('button', { name: '종료' }).click()
  await expect(page.getByText(BADGE_TEXT)).toBeHidden()
  await expect(sheet).toBeHidden()
})
