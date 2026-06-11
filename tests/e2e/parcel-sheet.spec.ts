import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import {
  bootWithMockedApi,
  compositedFill,
  COMPOSITE_TOLERANCE,
  GROUP_HEX,
  jibunOf,
  TAB_ID,
} from './helpers/mockApi'
import { findClickPoint, isNear, pixelAt } from './helpers/pixels'

// 명세: docs/specs/parcel-sheet.md — AC-8·AC-9·AC-10 (Playwright 소관은 이 3건)
// AC-1~7은 tests/unit/parcel/ParcelSheet.test.tsx·tests/unit/stores/ui.test.ts 소관.
// /api 모킹·부팅 대기는 helpers/mockApi.ts 공용 — GET /api/parcels/:id(지번·면적)와
// POST /api/tabs/:tabId/parcels/:parcelId(upsert 200 ok)가 추가로 모킹되어 있다.

// 엔진 보존 색상 (src/features/map/engine/colors.ts)
const PARCEL_FILL = { r: 255, g: 255, b: 255 } // 1차: 미지정 필지 채움 #FFFFFF
const MAP_BACKGROUND = { r: 251, g: 250, b: 246 } // 캔버스 배경 #FBFAF6 — 필지 밖 "빈 곳"

const MEMO_TEXT = 'E2E 협업 메모'

// 픽셀 스캔 헬퍼(findClickPoint·pixelAt·isNear)는 helpers/pixels.ts 공용 — M-8에서 추출

const PARCEL_GET_RE = /^\/api\/parcels\/[^/]+$/

function isParcelGet(req: Request): boolean {
  return req.method() === 'GET' && PARCEL_GET_RE.test(new URL(req.url()).pathname)
}

function parcelIdOf(req: Request): string {
  const segments = new URL(req.url()).pathname.split('/')
  return decodeURIComponent(segments[segments.length - 1])
}

/**
 * 미지정(흰 채움) 필지를 탭해 시트를 연다.
 * 탭된 필지 id는 시트가 보내는 GET /api/parcels/:id 요청에서 역산한다 —
 * 픽셀 스캔으로 고른 지점이라 id를 미리 알 수 없기 때문.
 */
async function tapParcelAndOpenSheet(page: Page, xMaxFrac?: number) {
  const point = await findClickPoint(page, PARCEL_FILL, 2, xMaxFrac)
  expect(point, '클릭 가능한 필지 내부 흰색 영역을 찾지 못함').not.toBeNull()
  if (!point) throw new Error('unreachable')

  const infoRequest = page.waitForRequest(isParcelGet)
  await page.mouse.click(point.x, point.y)
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  const parcelId = parcelIdOf(await infoRequest)
  return { point, parcelId, sheet }
}

/** 시트에서 파랑 선택 + 메모 입력 + 저장 — upsert POST 요청을 반환한다 */
async function saveBlueWithMemo(page: Page, sheet: Locator, parcelId: string) {
  await sheet.getByRole('button', { name: '파랑' }).click()
  await sheet.getByLabel('메모').fill(MEMO_TEXT)

  const upsertPath = `/api/tabs/${TAB_ID}/parcels/${encodeURIComponent(parcelId)}`
  const upsertRequest = page.waitForRequest(
    (req) => req.method() === 'POST' && new URL(req.url()).pathname === upsertPath,
  )
  await sheet.getByRole('button', { name: '저장' }).click()
  return await upsertRequest
}

test('AC-8: 필지를 탭하면 필지 시트가 열리고 해당 필지 지번이 표시된다', async ({ page }) => {
  await bootWithMockedApi(page)
  const { parcelId, sheet } = await tapParcelAndOpenSheet(page)

  // 헤더 메타 라벨 + 지번 표시 (이름 미입력 상태에서 지번은 이름 입력의 placeholder — v1 보존)
  await expect(sheet.getByText('지번', { exact: true })).toBeVisible()
  const jibun = jibunOf(parcelId)
  expect(jibun, `탭된 필지(${parcelId})의 지번이 parcels.json에 없음`).not.toBeNull()
  await expect(sheet.getByLabel('이름')).toHaveAttribute('placeholder', jibun ?? '')

  // 단건 조회(lndpclAr 픽스처) 기반 면적 행 — 단위 토글과 함께 렌더
  await expect(sheet.getByRole('button', { name: '㎡' })).toBeVisible()
})

test('AC-9: 색상+메모 저장 시 시트가 닫히고 필지 중심점 픽셀색이 저장 전과 달라진다', async ({
  page,
}) => {
  await bootWithMockedApi(page)
  const { point, parcelId, sheet } = await tapParcelAndOpenSheet(page)

  const before = await pixelAt(page, point)
  expect(before).not.toBeNull()

  const upsertRequest = await saveBlueWithMemo(page, sheet, parcelId)

  // 저장 본문: 병합·정규화된 전체 필드 + clientId (에코 가드) — 정규화 자체는 단위 테스트 소관
  const body = upsertRequest.postDataJSON() as Record<string, unknown>
  expect(body).toMatchObject({ color: 'c-blue', style: 'fill', memo: MEMO_TEXT })
  expect(typeof body.clientId).toBe('string')

  // 저장 완료 → 시트 닫힘 (backdrop도 소멸)
  await expect(sheet).toBeHidden()
  await expect(page.getByTestId('sheet-backdrop')).toHaveCount(0)

  // 캔버스 재렌더 — 탭 지점 픽셀이 흰 채움에서 파랑 합성색(hexA 0.55)으로 변한다
  const expected = compositedFill(GROUP_HEX)
  expect(before !== null && isNear(before, expected, COMPOSITE_TOLERANCE)).toBe(false)
  await expect
    .poll(
      async () => {
        const px = await pixelAt(page, point)
        return px !== null && isNear(px, expected, COMPOSITE_TOLERANCE)
      },
      { timeout: 10_000 },
    )
    .toBe(true)
  expect(await pixelAt(page, point)).not.toEqual(before)
})

test('AC-10: 저장 직후 같은 필지를 다시 탭하면 저장한 색 선택·메모가 유지되어 표시된다', async ({
  page,
}) => {
  await bootWithMockedApi(page)
  const { point, parcelId, sheet } = await tapParcelAndOpenSheet(page)

  await saveBlueWithMemo(page, sheet, parcelId)
  await expect(sheet).toBeHidden()

  // 낙관적 갱신 재렌더(파랑 합성 픽셀)까지 대기 — 같은 지점 재탭이 같은 필지에 닿는 가시 신호
  const expected = compositedFill(GROUP_HEX)
  await expect
    .poll(
      async () => {
        const px = await pixelAt(page, point)
        return px !== null && isNear(px, expected, COMPOSITE_TOLERANCE)
      },
      { timeout: 10_000 },
    )
    .toBe(true)

  // 같은 지점 재탭 → 시트 재열림, 같은 필지인지 단건 조회 id로 확인
  const infoRequest = page.waitForRequest(isParcelGet)
  await page.mouse.click(point.x, point.y)
  await expect(sheet).toBeVisible()
  expect(parcelIdOf(await infoRequest)).toBe(parcelId)

  // draft가 저장된 override로 초기화 — 색 선택·메모 유지
  await expect(sheet.getByLabel('메모')).toHaveValue(MEMO_TEXT)
  await expect(sheet.getByRole('button', { name: '파랑' })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('button', { name: '없음' })).toHaveAttribute('aria-pressed', 'false')
})

// ── B-1 와이드(≥720px) SidePanel 비모달 — 명세 §동작 명세 열림·닫힘 ──────────
// 반려 수정 B-1로 SidePanel backdrop이 제거되어 시트 연 채 지도 조작이 실경로가 됐다.
// "다른 필지 탭 → 시트 유지 + 대상 전환(draft 리셋)" / "빈 곳 탭 → 선택 해제 + 시트 닫힘" 검증.
test.describe('B-1 와이드: SidePanel 비모달', () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  // SidePanel(우측 고정 360px)이 1024px 뷰포트에서 x≥664를 덮는다 —
  // 클릭 지점 스캔을 x<60%(614px)로 제한해 패널이 클릭을 가로채지 못하게 한다.
  const WIDE_X_MAX = 0.6

  /** 탭한 필지 내부가 흰 채움인지(선택 강조 합성 여부) — 선택/해제의 캔버스 가시 신호 */
  async function isWhiteAt(page: Page, point: { x: number; y: number }) {
    const px = await pixelAt(page, point)
    return px !== null && isNear(px, PARCEL_FILL, COMPOSITE_TOLERANCE)
  }

  test('B-1-1 (와이드): 필지 탭 시 SidePanel이 backdrop 없이 열린다 — 비모달', async ({ page }) => {
    await bootWithMockedApi(page)
    const { sheet } = await tapParcelAndOpenSheet(page, WIDE_X_MAX)

    // SidePanel 경로 식별: 모바일 BottomSheet의 backdrop(testid)·aria-modal이 모두 부재
    await expect(page.getByTestId('sheet-backdrop')).toHaveCount(0)
    await expect(sheet).not.toHaveAttribute('aria-modal', 'true')
  })

  test('B-1-2 (와이드): 시트 연 채 다른 필지 탭 → 시트 유지 + 헤더 지번이 새 필지로 전환', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    const { point, parcelId, sheet } = await tapParcelAndOpenSheet(page, WIDE_X_MAX)

    // 4차 패스 선택 강조(무색 선택 채움)가 첫 필지 내부를 흰색→합성색으로 바꿀 때까지 대기 —
    // 다음 흰색 스캔이 같은 필지를 다시 고를 수 없어, 두 흰 영역 = 서로 다른 필지가 보장된다.
    await expect.poll(() => isWhiteAt(page, point), { timeout: 10_000 }).toBe(false)

    const second = await findClickPoint(page, PARCEL_FILL, 2, WIDE_X_MAX)
    expect(second, '두 번째 필지의 흰색 영역을 찾지 못함').not.toBeNull()
    if (!second) throw new Error('unreachable')

    // 패널이 열린 상태의 지도 탭(비모달 실경로) — 단건 조회 재요청으로 전환된 필지 id 역산
    const infoRequest = page.waitForRequest(isParcelGet)
    await page.mouse.click(second.x, second.y)
    const secondId = parcelIdOf(await infoRequest)
    expect(secondId).not.toBe(parcelId)

    // 시트는 닫히지 않고 대상만 전환 — 헤더 지번(이름 placeholder)이 새 필지 지번으로 교체
    await expect(sheet).toBeVisible()
    const secondJibun = jibunOf(secondId)
    expect(secondJibun, `전환된 필지(${secondId})의 지번이 parcels.json에 없음`).not.toBeNull()
    await expect(sheet.getByLabel('이름')).toHaveAttribute('placeholder', secondJibun ?? '')
  })

  test('B-1-3 (와이드): 시트 연 채 빈 곳(배경) 탭 → 선택 해제 + 시트 닫힘', async ({ page }) => {
    await bootWithMockedApi(page)
    const { point, sheet } = await tapParcelAndOpenSheet(page, WIDE_X_MAX)

    // 선택 강조 재렌더까지 대기 — 아래 "흰색 복귀"가 해제의 가시 신호가 되도록 기준점 확보
    await expect.poll(() => isWhiteAt(page, point), { timeout: 10_000 }).toBe(false)

    // 패널 밖 배경색(빈 곳) 지점 — 배경 픽셀은 어떤 필지 폴리곤에도 덮이지 않은 곳이라 히트테스트 null
    const empty = await findClickPoint(page, MAP_BACKGROUND, 2, WIDE_X_MAX)
    expect(empty, '패널 밖 배경색(빈 곳) 영역을 찾지 못함').not.toBeNull()
    if (!empty) throw new Error('unreachable')

    await page.mouse.click(empty.x, empty.y)

    // tapParcel(null): 시트 닫힘 + 선택 해제(선택 강조 소멸 → 필지 내부 흰 채움 복귀)
    await expect(sheet).toBeHidden()
    await expect.poll(() => isWhiteAt(page, point), { timeout: 10_000 }).toBe(true)
  })
})
