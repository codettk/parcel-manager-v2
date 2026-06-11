import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Docker(Windows 호스트) 볼륨 마운트에서 파일 이벤트가 전달되지 않아 폴링 필수 (명세서 §3.2)
    watch: { usePolling: true },
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    // Playwright E2E(tests/e2e)·핸들러 통합(tests/integration, 로컬 Supabase 필요)은 단위 실행에서 제외
    exclude: [...configDefaults.exclude, 'tests/e2e/**', 'tests/integration/**'],
  },
})
