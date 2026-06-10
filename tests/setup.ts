import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest globals 미사용 환경에서는 RTL auto-cleanup이 동작하지 않아 명시 등록 필요
afterEach(() => {
  cleanup()
})
