import { defineConfig } from 'vitest/config'

// 핸들러 통합 테스트 — 로컬 Supabase 필요 (pnpm exec supabase start).
// 기본 pnpm test(단위)와 분리: pnpm test:integration
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/integration/globalSetup.ts'],
    // 단일 로컬 DB를 공유하므로 파일 간 동시 실행 금지 (탭 불변식 테스트가 전역 상태를 만진다)
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
