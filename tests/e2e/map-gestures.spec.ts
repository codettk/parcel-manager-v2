import { expect, test, type Page } from '@playwright/test'

// 명세: docs/specs/map-gestures.md — AC-7 (드래그 팬 / 휠 줌 / 줌 버튼 / 탭 선택·해제)
// (AC-1~AC-5·AC-8은 tests/unit/map/useGestures.test.ts·gestureMath.test.ts,
//  AC-6은 tests/unit/map/hitTest.test.ts 단위 테스트 소관)

// 엔진 보존 색상 (src/features/map/engine/colors.ts MAP_COLORS)
const PARCEL_FILL = { r: 255, g: 255, b: 255 } // 1차: 미지정 필지 채움 #FFFFFF
const BACKGROUND = { r: 251, g: 250, b: 246 } // 배경 #FBFAF6
const SELECT_STROKE = { r: 31, g: 90, b: 56 } // 4차: 선택 강조 테두리 #1F5A38

type Rgb = { r: number; g: number; b: number }

/** 앱 로드 → 첫 draw(style.width 설정) → 필지 픽셀(배경 외 색) 출현까지 poll 대기 */
async function waitForParcelsRendered(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => {
    const cv = document.querySelector('canvas')
    return cv !== null && cv.style.width !== ''
  })
  await expect
    .poll(() => countExactPixels(page, PARCEL_FILL), { timeout: 15_000 })
    .toBeGreaterThan(0)
}

/** 캔버스 백버퍼 전체의 변화 감지용 체크섬 — 팬/줌 전후 비교 */
function canvasChecksum(page: Page) {
  return page.evaluate(() => {
    const cv = document.querySelector('canvas')
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return 0
    const { data } = ctx.getImageData(0, 0, cv.width, cv.height)
    let h = 0
    for (let i = 0; i < data.length; i += 16) {
      h = (h * 31 + data[i] + data[i + 1] + data[i + 2]) | 0
    }
    return h
  })
}

/** 지정 색과 정확히 일치하는 백버퍼 픽셀 수 */
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
 * 캔버스 픽셀 스캔으로 클릭 지점을 찾는다 — 하드코딩 좌표 대신 해상도 변화에 강한 방식.
 * 중앙 영역(x 15~70%, y 15~85%)만 스캔해 우측 오버레이 버튼(줌 컨트롤·릴리즈 노트)을 피하고,
 * 반경 margin(버퍼 px) 정사각형이 전부 같은 색인 지점만 반환해 필지 경계/안티앨리어싱을 배제한다.
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

test('AC-7: 마우스 드래그 팬(임계값 6px 초과) 전후 캔버스 픽셀이 달라진다', async ({ page }) => {
  await waitForParcelsRendered(page)
  const before = await canvasChecksum(page)

  const vp = page.viewportSize()
  if (!vp) throw new Error('viewport 없음')
  const cx = vp.width / 2
  const cy = vp.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 60, cy + 40, { steps: 6 }) // 총 72px — 마우스 임계값 6px 초과
  await page.mouse.up()

  // rAF 커밋 → 재렌더까지 poll (고정 sleep 금지)
  await expect.poll(() => canvasChecksum(page), { timeout: 10_000 }).not.toBe(before)
})

test('AC-7: 휠 줌(deltaY<0 확대 / deltaY>0 축소) 전후 캔버스 픽셀이 달라진다', async ({ page }) => {
  await waitForParcelsRendered(page)
  const vp = page.viewportSize()
  if (!vp) throw new Error('viewport 없음')
  await page.mouse.move(vp.width / 2, vp.height / 2)

  const before = await canvasChecksum(page)
  await page.mouse.wheel(0, -240) // deltaY<0 → 확대
  await expect.poll(() => canvasChecksum(page), { timeout: 10_000 }).not.toBe(before)

  const zoomedIn = await canvasChecksum(page)
  await page.mouse.wheel(0, 240) // deltaY>0 → 축소
  await expect.poll(() => canvasChecksum(page), { timeout: 10_000 }).not.toBe(zoomedIn)
})

test('AC-7: 줌 버튼(확대/축소) 클릭 전후 캔버스 픽셀이 달라진다', async ({ page }) => {
  await waitForParcelsRendered(page)

  const before = await canvasChecksum(page)
  await page.getByRole('button', { name: '확대' }).click()
  await expect.poll(() => canvasChecksum(page), { timeout: 10_000 }).not.toBe(before)

  const zoomedIn = await canvasChecksum(page)
  await page.getByRole('button', { name: '축소' }).click()
  await expect.poll(() => canvasChecksum(page), { timeout: 10_000 }).not.toBe(zoomedIn)
})

test('AC-7: 필지 탭 시 선택 강조(#1F5A38)가 나타나고 빈 곳 탭 시 사라진다', async ({ page }) => {
  await waitForParcelsRendered(page)

  // 선택 전에는 강조색 픽셀이 없다
  expect(await countExactPixels(page, SELECT_STROKE)).toBe(0)

  // 필지 내부(흰색 채움 균일 영역) 픽셀 스캔 → 클릭 → 4차 패스 선택 강조 출현
  const parcelPoint = await findClickPoint(page, PARCEL_FILL, 2)
  expect(parcelPoint, '클릭 가능한 필지 내부 흰색 영역을 찾지 못함').not.toBeNull()
  if (!parcelPoint) return
  await page.mouse.click(parcelPoint.x, parcelPoint.y)
  await expect
    .poll(() => countExactPixels(page, SELECT_STROKE), { timeout: 10_000 })
    .toBeGreaterThan(0)

  // 빈 곳(배경색 균일 영역) 클릭 → 선택 해제, 강조 소멸
  const bgPoint = await findClickPoint(page, BACKGROUND, 3)
  expect(bgPoint, '클릭 가능한 배경 영역을 찾지 못함').not.toBeNull()
  if (!bgPoint) return
  await page.mouse.click(bgPoint.x, bgPoint.y)
  await expect.poll(() => countExactPixels(page, SELECT_STROKE), { timeout: 10_000 }).toBe(0)
})
