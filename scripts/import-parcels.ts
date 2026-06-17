/**
 * 정적 지오데이터(parcels.json 형식) → parcels 테이블 멱등 upsert (region 스코프).
 *
 * 실행:
 *   pnpm import:parcels                         보구곶(parcels.json) → region_id=incheon-ganghwa-hwado
 *   pnpm import:parcels --region <id> --source <path>   임의 region 데이터셋 적재
 * 전제: 로컬 Supabase 기동(pnpm exec supabase start) + .env의
 *       SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *
 * 핵심 로직(runImport)은 export — 실 DB·파일 없이 fixture 단위 테스트가 가능하다(seed runSeed 선례).
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createDb } from '../server/handlers/db'
import type { Db } from '../server/handlers/db'

/** parcels.json·region 데이터셋 공통 구조 — public/data/regions/<id>.json도 동일 */
export interface ParcelsFile {
  bbox: [number, number, number, number]
  parcels: { id: string; jibun: string; c: [number, number][] }[]
}

/** 보구곶(parcels.json)의 region_id — AC-3 라벨링 키 */
export const BOGUGOT_REGION_ID = 'incheon-ganghwa-hwado'

const CHUNK = 500

export interface ImportOptions {
  regionId: string
  /** region 간 local_id 충돌을 막는 prefix. 보구곶(parcels.json)은 기존 키 보존 위해 빈 prefix. */
  localIdPrefix?: string
  chunkSize?: number
}

export interface ImportReport {
  regionId: string
  inputCount: number
  /** 적재 후 해당 region의 parcels 행 수 (멱등 재실행 검증용) */
  regionRowCount: number
}

/**
 * 데이터셋을 region_id로 라벨링해 parcels에 멱등 upsert.
 * - onConflict: local_id 라 재실행해도 행 수 불변(AC-3·4).
 * - region 간 PK 격리는 localIdPrefix로 보장(AC-4) — 보구곶은 prefix 없이 parcels.json id 보존.
 * parcels.json 파일 자체는 절대 변경하지 않는다(읽기만).
 */
export async function runImport(
  file: ParcelsFile,
  db: Db,
  opts: ImportOptions,
): Promise<ImportReport> {
  const prefix = opts.localIdPrefix ?? ''
  const chunk = opts.chunkSize ?? CHUNK
  const rows = file.parcels.map((p) => ({
    local_id: `${prefix}${p.id}`,
    jibun: p.jibun,
    coordinates: p.c,
    region_id: opts.regionId,
  }))

  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db
      .from('parcels')
      .upsert(rows.slice(i, i + chunk), { onConflict: 'local_id' })
    if (error) throw new Error(`upsert 실패 (offset ${i}): ${error.message}`)
  }

  const { count, error } = await db
    .from('parcels')
    .select('local_id', { count: 'exact', head: true })
    .eq('region_id', opts.regionId)
  if (error) throw new Error(error.message)

  return { regionId: opts.regionId, inputCount: rows.length, regionRowCount: count ?? 0 }
}

function parseArgs(argv: string[]): { regionId: string; source: string } {
  let regionId = BOGUGOT_REGION_ID
  let source = fileURLToPath(new URL('../public/data/parcels.json', import.meta.url))
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--region' && argv[i + 1]) regionId = argv[++i]
    else if (argv[i] === '--source' && argv[i + 1]) source = argv[++i]
  }
  return { regionId, source }
}

async function main(): Promise<void> {
  const { regionId, source } = parseArgs(process.argv.slice(2))
  const file = JSON.parse(readFileSync(source, 'utf-8')) as ParcelsFile
  const db = createDb(process.env)

  // 보구곶(parcels.json)은 기존 local_id 키를 그대로 보존(prefix 없음 — FK·V-World·면적 조회 정합).
  // 그 외 region은 region prefix로 PK 격리(AC-4).
  const localIdPrefix = regionId === BOGUGOT_REGION_ID ? '' : `${regionId}__`
  const report = await runImport(file, db, { regionId, localIdPrefix })
  console.log(
    `[import] region=${report.regionId} 입력 ${report.inputCount}행 → region 행 수 ${report.regionRowCount}`,
  )
}

// fileURLToPath(import.meta.url) === argv[1] 일 때만 실행(import 시 부작용 없음 — 테스트 안전)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
}
