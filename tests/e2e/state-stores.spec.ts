import { expect, test, type Page } from '@playwright/test'
import {
  bootWithMockedApi,
  compositedFill,
  countNearPixels,
  COMPOSITE_TOLERANCE,
  GROUP_HEX,
  type Rgb,
} from './helpers/mockApi'

// 명세: docs/specs/state-stores.md — AC-7·AC-8 (page.route 네트워크 모킹, 실DB 아님 — §E2E 데이터 경로 판정)
// (AC-1~AC-6은 tests/unit/stores/ workspace·selectors 단위 테스트 소관)
// 모킹 픽스처·부팅 대기는 helpers/mockApi.ts 공용 — 빨강(개별 override) 합성 픽셀 출현이 부팅 완료 신호.

// ── 픽셀 판정 ────────────────────────────────────────────────────────────────
// 엔진 보존 색상 (src/features/map/engine/colors.ts)
const PARCEL_FILL = { r: 255, g: 255, b: 255 } // 1차: 미지정 필지 채움 #FFFFFF
const SELECT_STROKE = { r: 31, g: 90, b: 56 } // 4차: 선택 강조 테두리 #1F5A38

/** 메인 캔버스 백버퍼에서 지정 색과 정확히 일치하는 픽셀 수 (map-gestures.spec.ts 패턴) */
function countExactPixels(page: Page, color: Rgb) {
  return page.evaluate(({ r, g, b }) => {
    const cv = document.querySelector('canvas')
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return 0
    const { data } = ctx.getImageData(0, 0, cv.width, cv.height)
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === r && data[i + 1] === g && data[i + 2] === b) count++
    }
    return count
  }, color)
}

/**
 * 캔버스 픽셀 스캔으로 클릭 지점을 찾는다 (map-gestures.spec.ts 패턴 재사용).
 * 중앙 영역(x 15~70%, y 15~85%)만 스캔해 우측 오버레이 버튼을 피하고,
 * 반경 margin 정사각형이 전부 같은 색인 지점만 반환해 경계/안티앨리어싱을 배제한다.
 */
function findClickPoint(page: Page, color: Rgb, margin: number) {
  return page.evaluate(
    ({ target, margin }) => {
      const cv = document.querySelector('canvas')
      const ctx = cv?.getContext('2d')
      if (!cv || !ctx) return null
      const { width, height } = cv
      const { data } = ctx.getImageData(0, 0, width, height)
      const matches = (x: number, y: number) => {
        const i = (y * width + x) * 4
        return data[i] === target.r && data[i + 1] === target.g && data[i + 2] === target.b
      }
      const x0 = Math.floor(width * 0.15)
      const x1 = Math.floor(width * 0.7)
      const y0 = Math.floor(height * 0.15)
      const y1 = Math.floor(height * 0.85)
      for (let y = y0 + margin; y < y1 - margin; y += 3) {
        for (let x = x0 + margin; x < x1 - margin; x += 3) {
          let uniform = true
          for (let dy = -margin; dy <= margin && uniform; dy++) {
            for (let dx = -margin; dx <= margin && uniform; dx++) {
              if (!matches(x + dx, y + dy)) uniform = false
            }
          }
          if (uniform) {
            const rect = cv.getBoundingClientRect()
            const dpr = width / rect.width
            return { x: rect.left + (x + 0.5) / dpr, y: rect.top + (y + 0.5) / dpr }
          }
        }
      }
      return null
    },
    { target: color, margin },
  )
}

test('AC-7: 모킹 부팅 완료 후 override 필지색·그룹색 합성 픽셀이 캔버스에 출현한다', async ({
  page,
}) => {
  await bootWithMockedApi(page) // 빨강(개별 override) 출현까지 대기 포함

  // 같은 tabState 응답의 그룹(파랑, 3차 패스)도 함께 렌더된다
  await expect
    .poll(() => countNearPixels(page, compositedFill(GROUP_HEX), COMPOSITE_TOLERANCE), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0)
})

test('AC-8: 필지 탭 시 선택 강조(#1F5A38)가 나타나고 빈 곳 탭 시 사라진다 — 스토어 치환 후 M-3 회귀', async ({
  page,
}) => {
  await bootWithMockedApi(page)

  // 선택 전에는 강조색 픽셀이 없다
  expect(await countExactPixels(page, SELECT_STROKE)).toBe(0)

  // 필지 내부(흰색 채움 균일 영역) 탭 → ui.tapParcel 경유 4차 패스 강조 출현
  // (bootWithMockedApi가 isInitializing 해제를 보장 — 해제 전이면 C-4 차단으로 fail)
  const parcelPoint = await findClickPoint(page, PARCEL_FILL, 2)
  expect(parcelPoint, '클릭 가능한 필지 내부 흰색 영역을 찾지 못함').not.toBeNull()
  if (!parcelPoint) return
  await page.mouse.click(parcelPoint.x, parcelPoint.y)
  await expect
    .poll(() => countExactPixels(page, SELECT_STROKE), { timeout: 10_000 })
    .toBeGreaterThan(0)

  // M-7 이후 필지 탭은 필지 시트도 함께 연다 — "빈 곳 탭 → 선택 해제"는 backdrop 탭으로 보존 검증.
  // BottomSheet의 400ms 닫힘 가드 안에 떨어진 탭은 무시되므로, 닫힐 때까지 backdrop 탭을 재시도한다 (고정 sleep 금지).
  // 탭 위치 (8,8): 바텀시트(max-h 85dvh)에 가려지지 않는 상단 영역.
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  const backdrop = page.getByTestId('sheet-backdrop')
  await expect
    .poll(
      async () => {
        try {
          await backdrop.click({ position: { x: 8, y: 8 }, timeout: 500 })
        } catch {
          // 시트가 이미 닫혀 backdrop이 사라진 경우 — 종료 판정은 아래 가시성으로
        }
        return await sheet.isVisible()
      },
      { timeout: 10_000 },
    )
    .toBe(false)

  // backdrop 탭(closeSheet)이 selectedParcelId도 해제 → 강조 소멸 (v1 보존 의미론)
  await expect.poll(() => countExactPixels(page, SELECT_STROKE), { timeout: 10_000 }).toBe(0)
})
