/**
 * public/data/parcels.json(4,409필지) → parcels 테이블 멱등 upsert.
 *
 * 실행: pnpm import:parcels  (또는 pnpm exec tsx scripts/import-parcels.ts)
 * 전제: 로컬 Supabase 기동(pnpm exec supabase start) + .env의
 *       SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createDb } from '../server/handlers/db'

interface ParcelsFile {
  bbox: [number, number, number, number]
  parcels: { id: string; jibun: string; c: [number, number][] }[]
}

const CHUNK = 500

async function main(): Promise<void> {
  const jsonPath = fileURLToPath(new URL('../public/data/parcels.json', import.meta.url))
  const file = JSON.parse(readFileSync(jsonPath, 'utf-8')) as ParcelsFile
  const db = createDb(process.env)

  const rows = file.parcels.map((p) => ({
    local_id: p.id,
    jibun: p.jibun,
    coordinates: p.c,
  }))

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db
      .from('parcels')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'local_id' })
    if (error) throw new Error(`upsert 실패 (offset ${i}): ${error.message}`)
  }

  const { count, error } = await db
    .from('parcels')
    .select('local_id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  console.log(`parcels 테이블 행 수: ${count} (입력 ${rows.length})`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
