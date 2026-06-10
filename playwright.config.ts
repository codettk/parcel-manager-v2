import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:5173',
    // 모바일 기본 뷰포트 — BottomSheet 경로로 테스트
    viewport: { width: 375, height: 667 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // 릴리즈 노트는 빌드 타임 ?raw 포함이므로 dev:api(3000) 불필요
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
