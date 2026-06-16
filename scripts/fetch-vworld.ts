/**
 * V-World 토지임야 정보 일괄 조회 — 전 필지(pnu 19자리)의 토지정보를 멱등 적재한다.
 *
 * 실행: pnpm fetch:vworld [--force]
 * 전제: 로컬/배포 Supabase + .env의 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *       + V_WORLD_LADFRLLIST(필수) / V_WORLD_DOMAIN(선택)
 *
 * - pnu 19자리 필지만 대상. 기본은 vworld_fetched_at IS NULL(미조회)만 — 재실행 멱등.
 *   --force 시 19자리 전량 재조회.
 * - 호출 간 200ms 대기 (V-World rate limit, v1 보존).
 * - 핵심 로직(대상 선정→조회→갱신)은 runFetchVworld로 export — 테스트에서 fetch mock과 호출.
 */
import 'dotenv/config'
import { createDb } from '../server/handlers/db'
import type { Db } from '../server/handlers/db'
import { fetchLadfrl } from '../server/handlers/vworld'
import type { LadfrlFailureKind, VWorldEnv } from '../server/handlers/vworld'

const PNU_LENGTH = 19
const PAGE = 1000
const CALL_DELAY_MS = 200

export interface FetchVworldOptions {
  force?: boolean
  /** 호출 간 대기(ms). 테스트에서 0으로 지정 가능 */
  delayMs?: number
}

export interface FetchVworldReport {
  total: number
  success: number
  failures: { localId: string; kind: LadfrlFailureKind; message: string }[]
}

interface TargetRow {
  local_id: string
  pnu: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** pnu 19자리 + (force 아니면 미조회) 필지를 .range() 페이징으로 전량 수집 */
async function selectTargets(db: Db, force: boolean): Promise<TargetRow[]> {
  const pnuPattern = '_'.repeat(PNU_LENGTH)
  const targets: TargetRow[] = []
  for (let from = 0; ; from += PAGE) {
    let query = db
      .from('parcels')
      .select('local_id, pnu')
      .like('pnu', pnuPattern)
      .order('local_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (!force) query = query.is('vworld_fetched_at', null)
    const { data, error } = await query
    if (error) throw new Error(`필지 목록 조회 실패: ${error.message}`)
    const rows = (data ?? []) as TargetRow[]
    targets.push(...rows)
    if (rows.length < PAGE) break
  }
  return targets
}

/**
 * 대상 선정 → 필지당 fetchLadfrl → 성공 UPDATE / 실패 기록 후 계속.
 * env.V_WORLD_LADFRLLIST 존재는 호출자(main)가 보장한다.
 */
export async function runFetchVworld(
  db: Db,
  env: VWorldEnv,
  options: FetchVworldOptions = {},
): Promise<FetchVworldReport> {
  const force = options.force ?? false
  const delayMs = options.delayMs ?? CALL_DELAY_MS
  const targets = await selectTargets(db, force)

  const report: FetchVworldReport = { total: targets.length, success: 0, failures: [] }

  for (let i = 0; i < targets.length; i++) {
    const { local_id, pnu } = targets[i]
    const result = await fetchLadfrl(pnu, env)
    if (result.ok) {
      const { error } = await db.from('parcels').update(result.mapping).eq('local_id', local_id)
      if (error) {
        report.failures.push({ localId: local_id, kind: 'no-data', message: error.message })
      } else {
        report.success += 1
      }
    } else {
      report.failures.push({ localId: local_id, kind: result.kind, message: result.message })
    }
    if (i < targets.length - 1 && delayMs > 0) await sleep(delayMs)
  }

  return report
}

function printReport(report: FetchVworldReport): void {
  console.log(
    `\nV-World 조회 완료: 대상 ${report.total} | 성공 ${report.success} | 실패 ${report.failures.length}`,
  )
  if (report.failures.length > 0) {
    const byKind = new Map<LadfrlFailureKind, number>()
    for (const f of report.failures) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1)
    console.log('실패 사유별:')
    for (const [kind, count] of byKind) console.log(`  - ${kind}: ${count}건`)
    for (const f of report.failures.slice(0, 20)) {
      console.log(`    ${f.localId} (${f.kind}): ${f.message}`)
    }
  }
}

async function main(): Promise<void> {
  if (!process.env.V_WORLD_LADFRLLIST) {
    console.error('오류: V_WORLD_LADFRLLIST 환경 변수가 설정되지 않았습니다.')
    process.exit(1)
  }
  const force = process.argv.includes('--force')
  const db = createDb(process.env)
  console.log(`V-World 일괄 조회 시작 (force=${force})`)
  const report = await runFetchVworld(db, process.env, { force })
  printReport(report)
  if (report.failures.length > 0) process.exitCode = 1
}

// 직접 실행 시에만 main 구동 — import(테스트) 시에는 실행하지 않는다
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('fetch-vworld.ts')
) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
}
