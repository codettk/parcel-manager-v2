import { beforeEach, describe, expect, it } from 'vitest'
import {
  regionAcquireHandler,
  regionRemoveHandler,
  regionsCatalogHandler,
  regionsMineHandler,
} from '../../server/handlers/regions'
import { errorResponseSchema, okResponseSchema } from '../../src/types/api/common'
import {
  regionAcquireResponseSchema,
  regionsResponseSchema,
  userRegionsResponseSchema,
} from '../../src/types/api/regions'
import { call, CLIENT_ID, ctx, db, getTestToken, issueFreshToken, TEST_USER_ID } from './helpers'

const LOADED_BOGUGOT = 'incheon-ganghwa-hwado'
const LOADED_SAMPLE = 'gyeonggi-gimpo-daegot'
const UPCOMING = 'incheon-ganghwa-ganghwa' // loaded=false (준비 중)

/** 각 테스트 전 테스트 사용자의 받은 목록을 비워 결정적 카운트를 만든다 */
async function purgeMine(): Promise<void> {
  await getTestToken() // TEST_USER_ID 채움
  const { error } = await db.from('user_regions').delete().eq('user_id', TEST_USER_ID)
  if (error) throw new Error(error.message)
}

describe('AC-1: GET /api/regions — 전역 공개 카탈로그 (인증 불요)', () => {
  it('인증 헤더 없이도 200 + sortOrder 순 카탈로그, 적재/준비중 시드가 모두 포함된다', async () => {
    // 인증 ctx 없이 직접 호출 — 공개 카탈로그
    const res = await regionsCatalogHandler({ method: 'GET', params: {}, query: {}, body: undefined }, ctx)
    expect(res.status).toBe(200)
    const regions = regionsResponseSchema.parse(res.body)

    const ids = regions.map((r) => r.id)
    expect(ids).toContain(LOADED_BOGUGOT)
    expect(ids).toContain(LOADED_SAMPLE)
    expect(ids).toContain(UPCOMING)

    const orders = regions.map((r) => r.sortOrder)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))

    const bogugot = regions.find((r) => r.id === LOADED_BOGUGOT)
    expect(bogugot?.loaded).toBe(true)
    expect(bogugot?.parcelCount).toBe(4409)
    expect(regions.find((r) => r.id === UPCOMING)?.loaded).toBe(false)
  })
})

describe('AC-7: POST /api/regions/:id/acquire — 받기 + GET mine 반영', () => {
  beforeEach(purgeMine)

  it('적재 region을 받으면 200 + mine 목록에 포함되고, 재요청해도 멱등(중복 없음)', async () => {
    const res = await call(regionAcquireHandler, 'POST', { id: LOADED_SAMPLE }, { clientId: CLIENT_ID })
    expect(res.status).toBe(200)
    const acquired = regionAcquireResponseSchema.parse(res.body)
    expect(acquired.regionId).toBe(LOADED_SAMPLE)

    const mine = userRegionsResponseSchema.parse((await call(regionsMineHandler, 'GET')).body)
    expect(mine.map((r) => r.regionId)).toContain(LOADED_SAMPLE)

    // 멱등 재요청 — 200, 행 수 불변
    const again = await call(regionAcquireHandler, 'POST', { id: LOADED_SAMPLE }, { clientId: CLIENT_ID })
    expect(again.status).toBe(200)
    const mine2 = userRegionsResponseSchema.parse((await call(regionsMineHandler, 'GET')).body)
    expect(mine2.filter((r) => r.regionId === LOADED_SAMPLE)).toHaveLength(1)
  })

  it('미존재 region 받기는 404', async () => {
    const res = await call(regionAcquireHandler, 'POST', { id: 'no-such-region' }, { clientId: CLIENT_ID })
    expect(res.status).toBe(404)
    errorResponseSchema.parse(res.body)
  })
})

describe('AC-8: loaded=false("준비 중") region 받기는 409', () => {
  beforeEach(purgeMine)

  it('준비 중 region 받기는 409이고 mine에 추가되지 않는다', async () => {
    const res = await call(regionAcquireHandler, 'POST', { id: UPCOMING }, { clientId: CLIENT_ID })
    expect(res.status).toBe(409)
    errorResponseSchema.parse(res.body)

    const mine = userRegionsResponseSchema.parse((await call(regionsMineHandler, 'GET')).body)
    expect(mine.map((r) => r.regionId)).not.toContain(UPCOMING)
  })
})

describe('AC-9: DELETE /api/regions/:id — 받은 목록에서 제거 (user_regions 행만)', () => {
  beforeEach(purgeMine)

  it('받은 2개 중 하나를 제거하면 200 + 그 region만 빠지고 parcels 마스터는 무영향', async () => {
    await call(regionAcquireHandler, 'POST', { id: LOADED_BOGUGOT }, { clientId: CLIENT_ID })
    await call(regionAcquireHandler, 'POST', { id: LOADED_SAMPLE }, { clientId: CLIENT_ID })

    const { count: before } = await db
      .from('parcels')
      .select('local_id', { count: 'exact', head: true })
      .eq('region_id', LOADED_SAMPLE)

    const res = await call(regionRemoveHandler, 'DELETE', { id: LOADED_SAMPLE }, { clientId: CLIENT_ID })
    expect(res.status).toBe(200)
    okResponseSchema.parse(res.body)

    const mine = userRegionsResponseSchema.parse((await call(regionsMineHandler, 'GET')).body)
    expect(mine.map((r) => r.regionId)).toContain(LOADED_BOGUGOT)
    expect(mine.map((r) => r.regionId)).not.toContain(LOADED_SAMPLE)

    const { count: after } = await db
      .from('parcels')
      .select('local_id', { count: 'exact', head: true })
      .eq('region_id', LOADED_SAMPLE)
    expect(after).toBe(before) // parcels 마스터 행 무영향
  })
})

describe('AC-10: 무인증 mutate는 401 (행 미기록/미삭제) — 카탈로그 조회는 예외', () => {
  beforeEach(purgeMine)

  const noAuthCtx = { env: process.env, auth: { token: null } }

  it('무토큰 acquire는 401이고 user_regions에 행이 기록되지 않는다', async () => {
    const res = await regionAcquireHandler(
      { method: 'POST', params: { id: LOADED_SAMPLE }, query: {}, body: { clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(res.status).toBe(401)
    errorResponseSchema.parse(res.body)

    const { count } = await db
      .from('user_regions')
      .select('region_id', { count: 'exact', head: true })
      .eq('user_id', TEST_USER_ID)
      .eq('region_id', LOADED_SAMPLE)
    expect(count).toBe(0)
  })

  it('무토큰 remove는 401, GET /api/regions/mine도 401, 카탈로그 GET은 200', async () => {
    const removeRes = await regionRemoveHandler(
      { method: 'DELETE', params: { id: LOADED_SAMPLE }, query: {}, body: { clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(removeRes.status).toBe(401)

    const mineRes = await regionsMineHandler(
      { method: 'GET', params: {}, query: {}, body: undefined },
      noAuthCtx,
    )
    expect(mineRes.status).toBe(401)

    const catalogRes = await regionsCatalogHandler(
      { method: 'GET', params: {}, query: {}, body: undefined },
      noAuthCtx,
    )
    expect(catalogRes.status).toBe(200)
  })
})

describe('AC-11: 받은 목록은 user_id에 종속 — 동일 user_id 재조회 시 동일 목록 (기기 독립)', () => {
  beforeEach(purgeMine)

  it('받은 뒤 새 토큰을 발급받아도 같은 user_id면 동일 받은 목록이 반환된다', async () => {
    await call(regionAcquireHandler, 'POST', { id: LOADED_BOGUGOT }, { clientId: CLIENT_ID })

    // 동일 사용자에게 두 번째 세션(다른 기기/토큰)을 발급해 조회 — 같은 user_id이므로 동일 목록
    const token2 = await issueFreshToken()

    const res = await regionsMineHandler(
      { method: 'GET', params: {}, query: {}, body: undefined },
      { env: process.env, auth: { token: token2 } },
    )
    expect(res.status).toBe(200)
    const mine = userRegionsResponseSchema.parse(res.body)
    expect(mine.map((r) => r.regionId)).toContain(LOADED_BOGUGOT)
  })
})
