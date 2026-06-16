import { describe, expect, it } from 'vitest'
import { calcRecipesHandler } from '../../../server/handlers/calcRecipes'
import { colorsCollectionHandler } from '../../../server/handlers/colors'
import { fetchLandInfoHandler } from '../../../server/handlers/parcels'
import {
  tabGroupsHandler,
  tabParcelHandler,
  tabResetHandler,
} from '../../../server/handlers/tabState'
import { tabsCollectionHandler } from '../../../server/handlers/tabs'
import type { HandlerContext } from '../../../server/handlers/types'

// 검증은 DB 접근보다 먼저 수행되므로 빈 env로 400 경로를 단위 검증할 수 있다
const ctx: HandlerContext = { env: {} }

describe('mutate 요청의 clientId 필수 검증 (AC-12 — 400 경로)', () => {
  it('POST /api/tabs — clientId 누락 시 400', async () => {
    const res = await tabsCollectionHandler(
      { method: 'POST', params: {}, query: {}, body: { name: '탭' } },
      ctx,
    )
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('POST /api/tabs/:tabId/parcels/:id — clientId 누락 시 400', async () => {
    const res = await tabParcelHandler(
      { method: 'POST', params: { tabId: 't', id: 'p' }, query: {}, body: { color: 'eco' } },
      ctx,
    )
    expect(res.status).toBe(400)
  })

  it('POST /api/tabs/:tabId/groups — clientId 누락 시 400', async () => {
    const res = await tabGroupsHandler(
      {
        method: 'POST',
        params: { tabId: 't' },
        query: {},
        body: { groupId: 'grp_x', group: null },
      },
      ctx,
    )
    expect(res.status).toBe(400)
  })

  it('POST /api/tabs/:tabId/reset — clientId 누락 시 400', async () => {
    const res = await tabResetHandler(
      { method: 'POST', params: { tabId: 't' }, query: {}, body: { items: ['color'] } },
      ctx,
    )
    expect(res.status).toBe(400)
  })

  it('PUT /api/colors — clientId 누락 시 400', async () => {
    const res = await colorsCollectionHandler(
      { method: 'PUT', params: {}, query: {}, body: { colors: [] } },
      ctx,
    )
    expect(res.status).toBe(400)
  })

  it('PUT /api/calc-recipes — clientId 누락 시 400 (M-10 AC-10 인접)', async () => {
    const res = await calcRecipesHandler(
      { method: 'PUT', params: {}, query: {}, body: { recipes: [] } },
      ctx,
    )
    expect(res.status).toBe(400)
  })
})

describe('fetch-land-info — 검증·구성 가드 (M-13)', () => {
  it('유효한 요청이라도 V_WORLD_LADFRLLIST 미설정 env면 503을 반환한다 (DB 미접근)', async () => {
    const res = await fetchLandInfoHandler(
      { method: 'POST', params: { id: 'p' }, query: {}, body: { clientId: 'c1' } },
      ctx,
    )
    expect(res.status).toBe(503)
    expect(res.body).toHaveProperty('error')
  })

  it('clientId 누락 시 400 (키 가드보다 먼저 검증)', async () => {
    const res = await fetchLandInfoHandler(
      { method: 'POST', params: { id: 'p' }, query: {}, body: {} },
      { env: { V_WORLD_LADFRLLIST: 'k' } },
    )
    expect(res.status).toBe(400)
  })

  it('POST 외 메서드에 405', async () => {
    const res = await fetchLandInfoHandler(
      { method: 'GET', params: { id: 'p' }, query: {}, body: { clientId: 'c1' } },
      { env: { V_WORLD_LADFRLLIST: 'k' } },
    )
    expect(res.status).toBe(405)
  })
})
