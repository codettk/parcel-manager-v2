import { expect, test, type Page } from '@playwright/test'

// 명세: docs/specs/map-labels.md — AC-8 (라벨 캔버스 픽셀 출현·줌인 증가·제스처 회귀 없음)
// (AC-1~AC-7은 tests/unit/engine/ wrapText·clusters·labels 단위 테스트,
//  AC-9는 ESLint no-restricted-imports 소관)

// 엔진 보존 색상 (src/features/map/engine/colors.ts MAP_COLORS)
const PARCEL_FILL = { r: 255, g: 255, b: 255 } // 1차: 미지정 필지 채움 #FFFFFF
const SELECT_STROKE = { r: 31, g: 90, b: 56 } // 4차: 선택 강조 테두리 #1F5A38

type Rgb = { r: number; g: number; b: number }

/** 앱 로드 → 첫 draw(style.width 설정) → 메인 캔버스 필지 픽셀 출현까지 poll 대기 */
async function waitForParcelsRendered(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => {
    const cv = document.querySelector('canvas')
    return cv !== null && cv.style.width !== ''
  })
  await expect
    .poll(() => countMainCanvasPixels(page, PARCEL_FILL), { timeout: 15_000 })
    .toBeGreaterThan(0)
}

/**
 * 라벨 캔버스 백버퍼의 비투명(alpha>0) 픽셀 수 — 라벨 출현 여부/증감 판정.
 * 라벨 캔버스는 DOM 구조 기반으로 탐색: 메인 캔버스(첫 canvas)의 다음 형제 (MapCanvas.tsx).
 */
function countLabelOpaquePixels(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('canvas')
    const sibling = main?.nextElementSibling
    const label = sibling instanceof HTMLCanvasElement ? sibling : null
    if (!label || label.width === 0 || label.height === 0) return -1
    const ctx = label.getContext('2d')
    if (!ctx) return -1
    const { data } = ctx.getImageData(0, 0, label.width, label.height)
    let count = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) count++
    }
    return count
  })
}

/** 메인 캔버스(첫 canvas) 백버퍼에서 지정 색과 정확히 일치하는 픽셀 수 */
function countMainCanvasPixels(page: Page, color: Rgb) {
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
 * 메인 캔버스 픽셀 스캔으로 클릭 지점을 찾는다 (map-gestures.spec.ts 패턴 재사용).
 * 중앙 영역(x 15~70%, y 15~85%)만 스캔해 우측 오버레이 버튼을 피하고,
 * 반경 margin 정사각형이 전부 같은 색인 지점만 반환해 경계/안티앨리어싱을 배제한다.
 * 반환 좌표 위에는 라벨 캔버스가 z-order로 덮여 있다 — 클릭이 통과해야 테스트가 성립.
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

test('AC-8: 초기 로드 시 라벨 캔버스에 비투명 픽셀(큰 필지 지번 라벨)이 존재한다', async ({
  page,
}) => {
  await waitForParcelsRendered(page)

  // 라벨 캔버스 존재 + 메인 캔버스와 동일 백버퍼 크기 + pointer-events 통과 속성
  const layout = await page.evaluate(() => {
    const main = document.querySelector('canvas')
    const sibling = main?.nextElementSibling
    const label = sibling instanceof HTMLCanvasElement ? sibling : null
    if (!main || !label) return null
    return {
      sameWidth: main.width === label.width,
      sameHeight: main.height === label.height,
      pointerEvents: getComputedStyle(label).pointerEvents,
    }
  })
  expect(layout, '라벨 캔버스(메인 캔버스 다음 형제)를 찾지 못함').not.toBeNull()
  expect(layout).toEqual({ sameWidth: true, sameHeight: true, pointerEvents: 'none' })

  // 초기 fit에서도 큰 필지의 지번 라벨은 크기 게이트를 통과해 그려진다
  await expect.poll(() => countLabelOpaquePixels(page), { timeout: 15_000 }).toBeGreaterThan(0)
})

test('AC-8: 줌 버튼(+) 2회 확대 후 라벨 캔버스 비투명 픽셀 수가 초기 대비 증가한다', async ({
  page,
}) => {
  await waitForParcelsRendered(page)
  await expect.poll(() => countLabelOpaquePixels(page), { timeout: 15_000 }).toBeGreaterThan(0)
  const initial = await countLabelOpaquePixels(page)

  // 크기 게이트는 scale에만 의존 — 줌인할수록 작은 필지 라벨이 점진 출현 (2회: 화면 내 필지 감소 전)
  await page.getByRole('button', { name: '확대' }).click()
  await page.getByRole('button', { name: '확대' }).click()

  // rAF 커밋 → 라벨 재렌더까지 poll (고정 sleep 금지)
  await expect
    .poll(() => countLabelOpaquePixels(page), { timeout: 10_000 })
    .toBeGreaterThan(initial)
})

test('AC-8: 확대 상태에서 필지 탭 시 선택 강조(#1F5A38)가 나타난다 — 라벨 캔버스가 탭을 가로채지 않음(M-3 회귀 없음)', async ({
  page,
}) => {
  await waitForParcelsRendered(page)
  await expect.poll(() => countLabelOpaquePixels(page), { timeout: 15_000 }).toBeGreaterThan(0)

  // 확대 상태로 진입 — 라벨이 더 많이 깔린 상태에서 탭 통과를 검증
  const beforeZoom = await countLabelOpaquePixels(page)
  await page.getByRole('button', { name: '확대' }).click()
  await page.getByRole('button', { name: '확대' }).click()
  await expect
    .poll(() => countLabelOpaquePixels(page), { timeout: 10_000 })
    .toBeGreaterThan(beforeZoom)

  // 선택 전에는 강조색 픽셀이 없다
  expect(await countMainCanvasPixels(page, SELECT_STROKE)).toBe(0)

  // 필지 내부(흰색 채움 균일 영역) 클릭 — 위에 덮인 라벨 캔버스를 통과해 히트테스트가 동작해야 한다
  const parcelPoint = await findClickPoint(page, PARCEL_FILL, 2)
  expect(parcelPoint, '클릭 가능한 필지 내부 흰색 영역을 찾지 못함').not.toBeNull()
  if (!parcelPoint) return
  await page.mouse.click(parcelPoint.x, parcelPoint.y)
  await expect
    .poll(() => countMainCanvasPixels(page, SELECT_STROKE), { timeout: 10_000 })
    .toBeGreaterThan(0)
})
