import { expect, test, type Request } from '@playwright/test'
import {
  bootWithMockedApi,
  compositedFill,
  COMPOSITE_TOLERANCE,
  countNearPixels,
  GROUP_HEX,
  openMenuItem,
  PARCEL_HEX,
  TAB_ID,
} from './helpers/mockApi'
import { findClickPoint, isNear, pixelAt } from './helpers/pixels'

// 명세: docs/specs/reset.md — AC-11 (Playwright 소관은 이 1건).
// AC-1~3은 tests/integration/tabState.test.ts(핸들러), AC-4~10은 RTL/스토어 단위 소관.
// POST /api/tabs/:tabId/reset은 helpers/mockApi.ts에 {ok:true}로 모킹 —
// pinned 보호·비고정 color 비움은 workspace 스토어의 낙관적 로컬 정리가 수행한다(서버 동형).
// 본문(items·clientId)·호출 횟수 검증은 이 spec이 waitForRequest로 수행한다.

const RESET_PATH = `/api/tabs/${TAB_ID}/reset`

/** resetTabRequestSchema(src/types/api/tabState.ts) 동형 — 요청 본문 검증용 */
interface ResetBody {
  items: string[]
  clientId: string
}

function isReset(req: Request): boolean {
  return req.method() === 'POST' && new URL(req.url()).pathname === RESET_PATH
}

test('AC-11: 색칠 필지 탭에서 color만 초기화(2단계) → 비고정 색 소실 + pinned 색 유지', async ({
  page,
}) => {
  // withPinnedParcel: 비고정 빨강 필지(RED_PARCEL_ID, c-red) + 고정 파랑 필지(PINNED, c-blue),
  // 기본 그룹 제거 → 파랑 합성색의 출처가 pinned 필지 단 하나라 "pinned 보호"를 색만으로 격리 검증
  await bootWithMockedApi(page, { withPinnedParcel: true })

  const redFill = compositedFill(PARCEL_HEX) // 비고정 필지 합성색 (초기화 대상)
  const blueFill = compositedFill(GROUP_HEX) // 고정 필지 합성색 (보호 대상)

  // 초기 상태: 빨강·파랑 합성 픽셀이 모두 캔버스에 존재 (Given — 색칠된 필지가 있는 탭)
  const bluePoint = await findClickPoint(page, blueFill, 2, 0.7, COMPOSITE_TOLERANCE)
  expect(bluePoint, 'pinned 필지의 파랑 합성 채움 영역을 찾지 못함').not.toBeNull()
  if (!bluePoint) throw new Error('unreachable')
  await expect
    .poll(() => countNearPixels(page, redFill, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBeGreaterThan(0)

  // 진입점: NavDrawer(메뉴) "초기화" 항목 → ResetSheet 열림
  await openMenuItem(page, '초기화')
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()

  // 기본 체크는 color·group 두 항목 — color만 남기려 그룹 체크 해제 (AC-11 "color 항목만 체크")
  const colorBox = sheet.getByRole('checkbox', { name: /색상/ })
  const groupBox = sheet.getByRole('checkbox', { name: /그룹/ })
  await expect(colorBox).toBeChecked()
  await expect(groupBox).toBeChecked()
  // 시각 표현 span이 sr-only input을 가려 .uncheck()가 가로채이므로 라벨 텍스트 클릭으로 토글
  await sheet.getByText(/그룹/).click()
  await expect(groupBox).not.toBeChecked()
  await expect(colorBox).toBeChecked()

  // 2단계 확인: ConfirmInline "초기화"(armed) → "실행". reset POST는 정확히 items:['color']로 1회
  const resetRequest = page.waitForRequest(isReset)
  await sheet.getByRole('button', { name: '초기화', exact: true }).click()
  await sheet.getByRole('button', { name: '실행' }).click()

  const body = (await resetRequest).postDataJSON() as ResetBody
  expect(body.items).toEqual(['color'])
  expect(typeof body.clientId).toBe('string')

  // Then 1: 시트가 닫힌다
  await expect(sheet).toBeHidden()

  // Then 2: 비고정 필지의 빨강 합성 픽셀이 전부 소실 (color 비움 → 기본 흰 채움 환원)
  await expect
    .poll(() => countNearPixels(page, redFill, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBe(0)

  // Then 3: pinned 필지의 파랑은 그대로 유지 (고정 보호) — 그 지점 픽셀이 여전히 파랑 합성색
  const bluePx = await pixelAt(page, bluePoint)
  expect(bluePx, 'pinned 지점 픽셀을 읽지 못함').not.toBeNull()
  if (!bluePx) throw new Error('unreachable')
  expect(isNear(bluePx, blueFill, COMPOSITE_TOLERANCE)).toBe(true)
  // 파랑 합성 픽셀이 캔버스에 여전히 다수 존재 (소실 0이 아님)
  await expect
    .poll(() => countNearPixels(page, blueFill, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBeGreaterThan(0)
})
