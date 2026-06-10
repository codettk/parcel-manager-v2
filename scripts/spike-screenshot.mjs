// 개발 검증용 스크린샷 스크립트 — usage: node scripts/spike-screenshot.mjs [path] [out.png] [width]
import { chromium } from '@playwright/test'

const [, , route = '/', out = 'scripts/spike-screenshot.png', width = '375'] = process.argv
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: Number(width), height: 667 } })
await page.goto(`http://localhost:5173${route}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
console.log(`saved: ${out}`)
