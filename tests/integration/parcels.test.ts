import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parcelAreasHandler, parcelItemHandler } from '../../server/handlers/parcels'
import { errorResponseSchema } from '../../src/types/api/common'
import { parcelAreasResponseSchema, parcelResponseSchema } from '../../src/types/api/parcels'
import { call, pickParcelIds } from './helpers'

// AC-15의 lint·typecheck·단위 테스트 green은 파이프라인 게이트(명령 실행)로 검증 — 여기는 API 부분.

describe('AC-15: GET /api/parcels/:id — 존재 필지 200 / 미존재 404', () => {
  it('존재하는 필지 id에 마스터 행을 반환하고 parcelResponseSchema를 통과한다', async () => {
    const [p] = await pickParcelIds(1)
    const res = await call(parcelItemHandler, 'GET', { id: p })
    expect(res.status).toBe(200)
    const parcel = parcelResponseSchema.parse(res.body)
    expect(parcel.localId).toBe(p)
    expect(parcel.jibun).toBeTruthy()
    expect(parcel.coordinates.length).toBeGreaterThan(2)
  })

  it('미존재 id에 404를 반환한다', async () => {
    const res = await call(parcelItemHandler, 'GET', { id: 'no_such_parcel_id' })
    expect(res.status).toBe(404)
    errorResponseSchema.parse(res.body)
  })
})

describe('AC-6: GET /api/parcel-areas — 1,000행 초과 전량 일괄 조회 / 비-GET 405', () => {
  it('전 필지(parcels.json 행 수)의 면적 레코드를 반환하고 스키마 parse를 통과한다 (1,000행 절단 없음)', async () => {
    const geo = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../public/data/parcels.json', import.meta.url)), {
        encoding: 'utf-8',
      }),
    ) as { parcels: { id: string }[] }
    expect(geo.parcels.length).toBeGreaterThan(1000) // 페이징 우회가 실제로 검증되는 전제

    const res = await call(parcelAreasHandler, 'GET')
    expect(res.status).toBe(200)
    const areas = parcelAreasResponseSchema.parse(res.body)
    expect(Object.keys(areas).length).toBe(geo.parcels.length)
    for (const { id } of geo.parcels) expect(areas).toHaveProperty(id)
  })

  it('GET 외 메서드에 405를 반환한다', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await call(parcelAreasHandler, method)
      expect(res.status).toBe(405)
      errorResponseSchema.parse(res.body)
    }
  })
})
