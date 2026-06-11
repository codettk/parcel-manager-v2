import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

/**
 * 통합 테스트 전 상태 재현: supabase db reset + import-parcels.
 * AC-1(스키마)·AC-2(임포트)가 바로 이 절차의 결과를 검증한다.
 */
export default function setup(): void {
  execSync('pnpm exec supabase db reset --yes', { cwd: root, stdio: 'inherit' })
  execSync('pnpm import:parcels', { cwd: root, stdio: 'inherit' })
}
