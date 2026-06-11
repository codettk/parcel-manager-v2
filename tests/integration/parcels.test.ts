import { describe, expect, it } from 'vitest'
import { parcelItemHandler } from '../../server/handlers/parcels'
import { errorResponseSchema } from '../../src/types/api/common'
import { parcelResponseSchema } from '../../src/types/api/parcels'
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
