import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './helpers/mockApi'

// 명세: docs/specs/map-render-engine.md — AC-6·AC-7
// (AC-1~AC-5는 tests/unit/engine/ 단위 테스트, AC-8은 ESLint no-restricted-imports 소관)
// 탭 입력이 없는 spec이므로 부팅 완료 대기는 불필요 — /api 모킹만 적용해
// webServer(vite 단독) 환경의 부팅 502 실패를 제거한다.

// 엔진 배경 보존값 #FBFAF6 (src/features/map/engine/colors.ts MAP_COLORS.background)
const BG = { r: 251, g: 250, b: 246 }

/** 호스트(MapCanvas)가 데이터 로드 후 첫 draw를 마칠 때까지 대기 — draw에서 style.width가 설정된다 */
async function waitForFirstDraw(page: Page) {
  await mockApi(page)
  await page.goto('/')
  await page.waitForFunction(() => {
    const cv = document.querySelector('canvas')
    return cv !== null && cv.style.width !== ''
  })
}

/** 캔버스 백버퍼 픽셀 집계 — 배경색/배경 외(필지 채움·테두리) 픽셀 수 */
function samplePixels(page: Page, bg: { r: number; g: number; b: number }) {
  return page.evaluate(({ r, g, b }) => {
    const cv = document.querySelector('canvas')
    if (!cv || cv.width === 0 || cv.height === 0) return { background: 0, foreground: 0 }
    const ctx = cv.getContext('2d')
    if (!ctx) return { background: 0, foreground: 0 }
    const { data } = ctx.getImageData(0, 0, cv.width, cv.height)
    let background = 0
    let foreground = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue // 렌더 전 투명 픽셀
      if (data[i] === r && data[i + 1] === g && data[i + 2] === b) background++
      else foreground++
    }
    return { background, foreground }
  }, bg)
}

test.describe('AC-6: DPR 2 백버퍼 크기', () => {
  test.use({ deviceScaleFactor: 2 })

  test('AC-6: deviceScaleFactor 2 컨텍스트에서 캔버스 백버퍼가 CSS 표시 크기의 정확히 2배다', async ({
    page,
  }) => {
    await waitForFirstDraw(page)

    const size = await page.evaluate(() => {
      const cv = document.querySelector('canvas')
      if (!cv) throw new Error('canvas 없음')
      const rect = cv.getBoundingClientRect()
      return {
        dpr: window.devicePixelRatio,
        buffer: { width: cv.width, height: cv.height },
        css: { width: rect.width, height: rect.height },
      }
    })

    expect(size.dpr).toBe(2)
    expect(size.css.width).toBeGreaterThan(0)
    expect(size.css.height).toBeGreaterThan(0)
    expect(size.buffer.width).toBe(Math.round(size.css.width * 2))
    expect(size.buffer.height).toBe(Math.round(size.css.height * 2))
  })
})

test('AC-7: 4,409필지 렌더 후 캔버스에 배경색(#FBFAF6) 외 픽셀이 존재하고 스크린샷이 저장된다', async ({
  page,
}, testInfo) => {
  await waitForFirstDraw(page)

  // 고정 sleep 금지 — 필지 픽셀(배경 외 색)이 그려질 때까지 poll
  await expect
    .poll(async () => (await samplePixels(page, BG)).foreground, { timeout: 15_000 })
    .toBeGreaterThan(0)

  const pixels = await samplePixels(page, BG)
  expect(pixels.background).toBeGreaterThan(0) // 배경이 칠해졌고
  expect(pixels.foreground).toBeGreaterThan(0) // 필지 채움/테두리도 존재 — 빈 캔버스 아님

  // v1 시각 비교용 산출물 — verifier(5단계)가 이 스크린샷으로 비교 보고 (리스크 R-2)
  const screenshotPath = 'test-results/map-render-engine-ac7.png'
  const screenshot = await page.screenshot({ path: screenshotPath, fullPage: true })
  await testInfo.attach('map-render-engine-ac7', { body: screenshot, contentType: 'image/png' })
})
