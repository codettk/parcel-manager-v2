import { expect, test, type Page, type Request } from '@playwright/test'
import {
  bootWithMockedApi,
  CALC_RECIPE_FIXTURE,
  compositedFill,
  COMPOSITE_TOLERANCE,
  GROUP_HEX,
  GROUP_MEMBER_IDS,
  jibunOf,
} from './helpers/mockApi'
import { findClickPoint } from './helpers/pixels'

// 명세: docs/specs/calculator.md — AC-11·AC-12 (Playwright 소관은 이 2건)
// AC-1~9는 tests/unit/calculator/ 소관, AC-10은 tests/integration/calcRecipes.test.ts 소관.
// /api/calc-recipes GET/PUT은 helpers/mockApi.ts에 상태 보존으로 모킹.
// 환산값 리터럴 근거 (단건 조회 픽스처 면적 = 전 필지 1234.5㎡, 레시피 300㎡당 20):
//   개별 (1234.5/300)×20 = 82.3 · 그룹(멤버 2) 합산 2469㎡ → (2469/300)×20 = 164.6

// 엔진 보존 색상 (src/features/map/engine/colors.ts)
const PARCEL_FILL = { r: 255, g: 255, b: 255 } // 1차: 미지정(비그룹·무색) 필지 채움 #FFFFFF

const BADGE_TEXT = '계산기 모드 — 필지를 탭하세요'

const PARCEL_GET_RE = /^\/api\/parcels\/[^/]+$/

function isParcelGet(req: Request): boolean {
  return req.method() === 'GET' && PARCEL_GET_RE.test(new URL(req.url()).pathname)
}

function parcelIdOf(req: Request): string {
  const segments = new URL(req.url()).pathname.split('/')
  return decodeURIComponent(segments[segments.length - 1])
}

/** 임시 진입 버튼(지도 우상단)으로 설정 시트를 연다 — GET /api/calc-recipes 후 본문이 렌더된다 */
async function openSettingsSheet(page: Page) {
  await page.getByRole('button', { name: '자동 계산기' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  return sheet
}

test('AC-11: 설정 → 계산 시작 → 배지 → 비그룹 필지 탭 결과 시트 → 종료 후 일반 시트 복귀', async ({
  page,
}) => {
  await bootWithMockedApi(page) // 레시피 미설정(null)로 시작 — 설정 시트에서 직접 추가한다
  const sheet = await openSettingsSheet(page)

  // 항목 추가 — v1 기본값 행(300 ㎡당 0 L)에 자재명·투입량 입력
  // (draft 입력 필터·trailing dot은 AC-6 RTL 소관 — 여기선 사용자 여정만)
  await sheet.getByRole('button', { name: '+ 항목 추가' }).click()
  await expect(sheet.getByLabel('기준 면적')).toHaveValue('300')
  await sheet.getByLabel('자재명').fill('석회')
  await sheet.getByLabel('투입량').fill('20')

  // "계산 시작" = 저장(PUT — 문자열 draft의 숫자 변환 + clientId 에코 가드) + 모드 진입
  const putRequest = page.waitForRequest(
    (req) => req.method() === 'PUT' && new URL(req.url()).pathname === '/api/calc-recipes',
  )
  await sheet.getByRole('button', { name: '계산 시작' }).click()
  const putBody = (await putRequest).postDataJSON() as { recipes: unknown[]; clientId: unknown }
  expect(putBody.recipes).toHaveLength(1)
  expect(putBody.recipes[0]).toMatchObject({
    name: '석회',
    baseArea: 300,
    baseUnit: '㎡',
    amount: 20,
    amountUnit: 'L',
  })
  expect(typeof putBody.clientId).toBe('string')

  // 설정 시트 닫힘 + 계산기 모드 배지 표시
  await expect(sheet).toBeHidden()
  await expect(page.getByText(BADGE_TEXT)).toBeVisible()

  // 비그룹(흰 채움) 필지 탭 → 결과 시트 직행 — 탭된 필지 id는 단건 조회 요청에서 역산
  const point = await findClickPoint(page, PARCEL_FILL, 2)
  expect(point, '클릭 가능한 필지 내부 흰색 영역을 찾지 못함').not.toBeNull()
  if (!point) throw new Error('unreachable')
  const infoRequest = page.waitForRequest(isParcelGet)
  await page.mouse.click(point.x, point.y)
  await expect(sheet).toBeVisible()
  const parcelId = parcelIdOf(await infoRequest)

  // 결과 시트: 지번 헤더 + 면적(픽스처 1234.5㎡) + 레시피 환산값 리터럴 (82.3 L)
  await expect(sheet.getByText('계산 결과')).toBeVisible()
  const jibun = jibunOf(parcelId)
  expect(jibun, `탭된 필지(${parcelId})의 지번이 parcels.json에 없음`).not.toBeNull()
  await expect(sheet.getByRole('heading', { name: jibun ?? '' })).toBeVisible()
  await expect(sheet.getByText('1,234.5 ㎡')).toBeVisible()
  await expect(sheet.getByText('석회')).toBeVisible()
  await expect(sheet.getByText('82.3 L')).toBeVisible()
  // 비그룹 — 개별/그룹 토글 없음
  await expect(sheet.getByRole('button', { name: '개별 지번' })).toHaveCount(0)

  // "종료" → 모드 해제: 배지·결과 시트 소멸
  await page.getByRole('button', { name: '종료' }).click()
  await expect(page.getByText(BADGE_TEXT)).toBeHidden()
  await expect(sheet).toBeHidden()

  // 같은 필지 재탭 → 일반 필지 시트 (지번 메타 + 이름 입력 = ParcelSheet 식별, 결과 시트 아님)
  const reopenRequest = page.waitForRequest(isParcelGet)
  await page.mouse.click(point.x, point.y)
  await expect(sheet).toBeVisible()
  expect(parcelIdOf(await reopenRequest)).toBe(parcelId)
  await expect(sheet.getByText('지번', { exact: true })).toBeVisible()
  await expect(sheet.getByLabel('이름')).toHaveAttribute('placeholder', jibun ?? '')
  await expect(sheet.getByText('계산 결과')).toHaveCount(0)
})

test('AC-12: 계산기 모드에서 그룹 필지 탭 → 그룹 전체 기본 결과 → 개별 지번 전환 재계산', async ({
  page,
}) => {
  // 저장된 레시피(석회 300㎡당 20kg)로 부팅 — 설정 시트는 GET 최신화된 행을 그대로 보여준다
  await bootWithMockedApi(page, { calcRecipes: [CALC_RECIPE_FIXTURE] })
  const sheet = await openSettingsSheet(page)
  await expect(sheet.getByLabel('자재명')).toHaveValue('석회')
  await sheet.getByRole('button', { name: '계산 시작' }).click()
  await expect(page.getByText(BADGE_TEXT)).toBeVisible()

  // 그룹 멤버(파랑 합성 채움 hexA 0.55) 탭 — 계산기 모드는 그룹 시트 분기 비경유, 결과 시트 직행.
  // 결과 시트의 첫 단건 조회 = 탭된 필지 (조회 순서 [parcelId, ...members])
  const point = await findClickPoint(page, compositedFill(GROUP_HEX), 2, 0.7, COMPOSITE_TOLERANCE)
  expect(point, '그룹 파랑 합성색 영역을 찾지 못함').not.toBeNull()
  if (!point) throw new Error('unreachable')
  const infoRequest = page.waitForRequest(isParcelGet)
  await page.mouse.click(point.x, point.y)
  await expect(sheet).toBeVisible()
  const tappedId = parcelIdOf(await infoRequest)
  expect(GROUP_MEMBER_IDS).toContain(tappedId)

  // 기본 '그룹 전체 (2필지)' — 그룹명 헤더 + 합산 면적(1234.5×2 = 2469㎡) 기준 결과 164.6 kg
  await expect(sheet.getByText('계산 결과')).toBeVisible()
  await expect(sheet.getByRole('button', { name: '그룹 전체 (2필지)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(sheet.getByRole('heading', { name: '파랑 그룹' })).toBeVisible()
  await expect(sheet.getByText('2,469 ㎡')).toBeVisible()
  await expect(sheet.getByText('164.6 kg')).toBeVisible()

  // '개별 지번' 전환 — 탭된 필지 면적(1234.5㎡) 기준 즉시 재계산 (82.3 kg)
  await sheet.getByRole('button', { name: '개별 지번' }).click()
  await expect(sheet.getByRole('button', { name: '개별 지번' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const jibun = jibunOf(tappedId)
  expect(jibun, `탭된 멤버(${tappedId})의 지번이 parcels.json에 없음`).not.toBeNull()
  await expect(sheet.getByRole('heading', { name: jibun ?? '' })).toBeVisible()
  await expect(sheet.getByText('1,234.5 ㎡')).toBeVisible()
  await expect(sheet.getByText('82.3 kg')).toBeVisible()
  await expect(sheet.getByText('164.6 kg')).toHaveCount(0)
})
