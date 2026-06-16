import { expect, test, type Page, type Request } from '@playwright/test'
import type { ColorLabel } from '../../src/types/api/colors'
import {
  bootWithMockedApi,
  compositedFill,
  COMPOSITE_TOLERANCE,
  countNearPixels,
  GROUP_HEX,
  openMenuItem,
  PARCEL_HEX,
  RED_PARCEL_ID,
} from './helpers/mockApi'
import { findClickPoint } from './helpers/pixels'

// 명세: docs/specs/color-palette.md — AC-6·AC-7 (Playwright 소관은 이 2건)
// AC-1~5는 tests/unit/stores/·tests/unit/palette/·tests/unit/ui/ColorPicker RTL 소관.
// /api 모킹·부팅 대기는 helpers/mockApi.ts 공용 — PUT /api/colors·DELETE /api/colors/:id가
// 상태 보존으로 모킹되어 있다 (저장 후 GET이 갱신 목록을 반환).

// 엔진 보존 색상 (src/features/map/engine/colors.ts) — 1차: 미지정 필지 채움
const PARCEL_FILL = { r: 255, g: 255, b: 255 }

const PARCEL_GET_RE = /^\/api\/parcels\/[^/]+$/

function isParcelGet(req: Request): boolean {
  return req.method() === 'GET' && PARCEL_GET_RE.test(new URL(req.url()).pathname)
}

function parcelIdOf(req: Request): string {
  const segments = new URL(req.url()).pathname.split('/')
  return decodeURIComponent(segments[segments.length - 1])
}

/** NavDrawer(메뉴) "색상 팔레트" 항목으로 팔레트 시트를 연다 */
async function openPaletteSheet(page: Page) {
  await openMenuItem(page, '색상 팔레트')
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  // 첫 행 = sortOrder 0 = 픽스처 '빨강' — draft가 colorLabels 순서로 복사됐다는 전제 고정
  await expect(sheet.getByLabel('색상 이름').first()).toHaveValue('빨강')
  return sheet
}

/** PUT /api/colors 본문을 기다려 반환 (저장 버튼 클릭과 짝) */
function waitForColorsPut(page: Page) {
  return page.waitForRequest(
    (req) => req.method() === 'PUT' && new URL(req.url()).pathname === '/api/colors',
  )
}

test('AC-6: 라벨을 "과수원"으로 변경·저장하면 필지 시트 스와치에 새 라벨이 반영된다', async ({
  page,
}) => {
  await bootWithMockedApi(page)
  const palette = await openPaletteSheet(page)

  // 첫 색(빨강)의 라벨만 변경 — hex·순서는 그대로
  await palette.getByLabel('색상 이름').first().fill('과수원')

  const putPromise = waitForColorsPut(page)
  await palette.getByRole('button', { name: '저장' }).click()

  // 저장 본문: 행 인덱스로 재부여된 sortOrder + clientId (에코 가드)
  const body = (await putPromise).postDataJSON() as { colors: ColorLabel[]; clientId: unknown }
  expect(body.colors).toEqual([
    { colorId: 'c-red', label: '과수원', hex: PARCEL_HEX, sortOrder: 0 },
    { colorId: 'c-blue', label: '파랑', hex: GROUP_HEX, sortOrder: 1 },
  ])
  expect(typeof body.clientId).toBe('string')

  // 저장 완료 → 팔레트 닫힘
  await expect(palette).toBeHidden()

  // 미지정(흰 채움) 필지를 탭해 필지 시트 열기 — 색 스와치에 새 라벨 노출
  const point = await findClickPoint(page, PARCEL_FILL, 2)
  expect(point, '클릭 가능한 필지 내부 흰색 영역을 찾지 못함').not.toBeNull()
  if (!point) throw new Error('unreachable')
  await page.mouse.click(point.x, point.y)

  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: '과수원' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: '빨강' })).toHaveCount(0)
})

test('AC-7: 칠해진 색 삭제·저장 시 캔버스 합성 픽셀 소실 + 필지 시트 색 미선택 + 스와치 소실', async ({
  page,
}) => {
  await bootWithMockedApi(page)

  // 빨강 필지(RED_PARCEL_ID, override style=fill) 내부 지점 — 삭제 후 같은 지점 재탭용.
  // 합성색은 비정수 기대값이라 허용오차 매칭으로 스캔한다
  const redFill = compositedFill(PARCEL_HEX)
  const redPoint = await findClickPoint(page, redFill, 2, 0.7, COMPOSITE_TOLERANCE)
  expect(redPoint, '빨강 합성 채움 영역을 찾지 못함').not.toBeNull()
  if (!redPoint) throw new Error('unreachable')

  const palette = await openPaletteSheet(page)

  // /api/colors 호출 리코더 — DELETE→PUT 순서와 "저장 전 API 미호출" 검증용
  const colorCalls: string[] = []
  page.on('request', (req) => {
    const { pathname } = new URL(req.url())
    if (pathname.startsWith('/api/colors')) colorCalls.push(`${req.method()} ${pathname}`)
  })

  // 2단계 삭제 1탭 — 행은 아직 미삭제, 현재 탭 참조 수(override 필지 1개) 경고 표시
  await palette.getByRole('button', { name: '색상 삭제' }).first().click()
  await expect(
    palette.getByText('필지 1개가 색상 없음으로 변경됩니다 (모든 탭 적용)'),
  ).toBeVisible()
  await expect(palette.getByLabel('색상 이름')).toHaveCount(2)

  // 확인 탭 — draft에서 행 제거, API는 저장까지 미호출 (draft 누적)
  await palette.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(palette.getByLabel('색상 이름')).toHaveCount(1)
  expect(colorCalls).toEqual([])

  // 저장 — DELETE(삭제 마크) → PUT(남은 색 + sortOrder 재부여) 순서
  const deletePromise = page.waitForRequest(
    (req) => req.method() === 'DELETE' && new URL(req.url()).pathname === '/api/colors/c-red',
  )
  const putPromise = waitForColorsPut(page)
  await palette.getByRole('button', { name: '저장' }).click()

  const deleteBody = (await deletePromise).postDataJSON() as { clientId: unknown }
  expect(typeof deleteBody.clientId).toBe('string')
  const putBody = (await putPromise).postDataJSON() as { colors: ColorLabel[] }
  expect(putBody.colors).toEqual([
    { colorId: 'c-blue', label: '파랑', hex: GROUP_HEX, sortOrder: 0 },
  ])
  expect(colorCalls).toEqual(['DELETE /api/colors/c-red', 'PUT /api/colors'])

  await expect(palette).toBeHidden()

  // 낙관적 로컬 정리 → 재렌더: 메인 캔버스에서 빨강 합성 픽셀이 전부 소실
  await expect
    .poll(() => countNearPixels(page, redFill, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBe(0)

  // 같은 지점 재탭 → 그 필지(RED_PARCEL_ID) 시트: 선택된 색 없음 + 스와치 목록에 빨강 부재
  const infoRequest = page.waitForRequest(isParcelGet)
  await page.mouse.click(redPoint.x, redPoint.y)
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  expect(parcelIdOf(await infoRequest)).toBe(RED_PARCEL_ID)

  await expect(sheet.getByRole('button', { name: '없음' })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('button', { name: '파랑' })).toHaveAttribute('aria-pressed', 'false')
  await expect(sheet.getByRole('button', { name: '빨강' })).toHaveCount(0)
})
