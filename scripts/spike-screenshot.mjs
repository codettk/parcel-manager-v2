// Phase 0-7 스파이크 검증용 1회성 스크립트 — 폴리곤 렌더 확인 스크린샷
import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 667 } })
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/spike-screenshot.png' })
await browser.close()
console.log('saved: scripts/spike-screenshot.png')
