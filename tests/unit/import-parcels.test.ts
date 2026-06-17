import { describe, expect, it } from 'vitest'
import type { Db } from '../../server/handlers/db'
import { BOGUGOT_REGION_ID, runImport } from '../../scripts/import-parcels'
import type { ParcelsFile } from '../../scripts/import-parcels'

/**
 * 적재 스크립트 fixture 단위 테스트 (AC-3·4) — 실 Supabase 없이 인메모리 Fake Db로 검증.
 * runImport가 ① region_id 라벨링 ② local_id prefix PK 격리 ③ 멱등 upsert(onConflict=local_id)를
 * 수행하는지 확인한다. parcels.json은 읽지 않는다(구조만 모사).
 */

interface UpsertRow {
  local_id: string
  jibun: string
  coordinates: [number, number][]
  region_id: string
}

/** local_id를 PK로 멱등 upsert + region_id별 count(head)를 흉내내는 최소 Fake Db */
function fakeDb(): { db: Db; store: Map<string, UpsertRow> } {
  const store = new Map<string, UpsertRow>()
  const db = {
    from() {
      let regionFilter: string | null = null
      const builder = {
        upsert(rows: UpsertRow[], opts: { onConflict: string }) {
          expect(opts.onConflict).toBe('local_id')
          for (const row of rows) store.set(row.local_id, row) // PK 멱등 — 재실행 시 덮어쓰기
          return Promise.resolve({ error: null })
        },
        select() {
          return builder
        },
        eq(_col: string, value: string) {
          regionFilter = value
          // head:true count 응답 형태를 then으로 흉내
          return {
            then(resolve: (r: { count: number; error: null }) => void) {
              const count = [...store.values()].filter((r) => r.region_id === regionFilter).length
              resolve({ count, error: null })
            },
          }
        },
      }
      return builder
    },
  } as unknown as Db
  return { db, store }
}

const SAMPLE: ParcelsFile = {
  bbox: [126.5, 37.6, 126.6, 37.7],
  parcels: [
    { id: '101', jibun: '1-1', c: [[126.5, 37.6], [126.51, 37.6], [126.51, 37.61], [126.5, 37.6]] },
    { id: '102', jibun: '1-2', c: [[126.52, 37.6], [126.53, 37.6], [126.53, 37.61], [126.52, 37.6]] },
  ],
}

describe('AC-3: 보구곶(parcels.json) 적재 — region_id 라벨링 + local_id 키 보존 + 멱등', () => {
  it('prefix 없이 보구곶 region_id로 라벨링되고, 재실행해도 행 수가 불변(멱등)', async () => {
    const { db, store } = fakeDb()
    const r1 = await runImport(SAMPLE, db, { regionId: BOGUGOT_REGION_ID, localIdPrefix: '' })
    expect(r1.regionRowCount).toBe(2)
    expect([...store.keys()]).toEqual(['101', '102']) // parcels.json id 보존(FK 정합)
    expect([...store.values()].every((r) => r.region_id === BOGUGOT_REGION_ID)).toBe(true)

    const r2 = await runImport(SAMPLE, db, { regionId: BOGUGOT_REGION_ID, localIdPrefix: '' })
    expect(r2.regionRowCount).toBe(2) // 재실행 후에도 동일 — 멱등
    expect(store.size).toBe(2)
  })
})

describe('AC-4: 샘플 region 적재 — region prefix로 PK 격리(보구곶과 미충돌)', () => {
  it('샘플 region은 prefix가 붙은 local_id로 적재되어 보구곶 키와 충돌하지 않는다', async () => {
    const { db, store } = fakeDb()
    await runImport(SAMPLE, db, { regionId: BOGUGOT_REGION_ID, localIdPrefix: '' })

    const sampleId = 'gyeonggi-gimpo-daegot'
    const r = await runImport(SAMPLE, db, { regionId: sampleId, localIdPrefix: `${sampleId}__` })
    expect(r.regionRowCount).toBe(2)

    // 보구곶 2 + 샘플 2 = 4행, 키 충돌 없음
    expect(store.size).toBe(4)
    expect(store.has('101')).toBe(true) // 보구곶
    expect(store.has(`${sampleId}__101`)).toBe(true) // 샘플 — prefix 격리
    expect([...store.values()].filter((row) => row.region_id === BOGUGOT_REGION_ID)).toHaveLength(2)
    expect([...store.values()].filter((row) => row.region_id === sampleId)).toHaveLength(2)
  })
})
