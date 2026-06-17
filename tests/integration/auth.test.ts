import { describe, expect, it } from 'vitest'
import { meHandler } from '../../server/handlers/auth'
import { tabGroupsHandler, tabParcelHandler } from '../../server/handlers/tabState'
import { tabsCollectionHandler } from '../../server/handlers/tabs'
import { meResponseSchema } from '../../src/types/api/auth'
import { errorResponseSchema } from '../../src/types/api/common'
import { tabSchema } from '../../src/types/api/tabs'
import { call, createTab, db, getTestToken, pickParcelIds, TEST_USER_ID } from './helpers'

async function fetchColumns<T extends Record<string, unknown>>(
  table: string,
  columns: string,
  filters: Record<string, string>,
): Promise<T> {
  let query = db.from(table).select(columns)
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value)
  const { data, error } = await query.single()
  if (error) throw new Error(error.message)
  return data as unknown as T
}

describe('GET /api/me — 세션 신원 (auth-accounts)', () => {
  it('유효 토큰이면 200 meResponseSchema, userId가 세션 사용자와 일치한다', async () => {
    const token = await getTestToken()
    const res = await meHandler(
      { method: 'GET', params: {}, query: {}, body: undefined },
      { env: process.env, auth: { token } },
    )
    expect(res.status).toBe(200)
    const me = meResponseSchema.parse(res.body)
    expect(me.userId).toBe(TEST_USER_ID)
  })

  it('무토큰이면 401 errorResponseSchema (AC-12)', async () => {
    const res = await meHandler(
      { method: 'GET', params: {}, query: {}, body: undefined },
      { env: process.env, auth: { token: null } },
    )
    expect(res.status).toBe(401)
    errorResponseSchema.parse(res.body)
  })

  it('무효 토큰이면 401 (GoTrue 검증 실패)', async () => {
    const res = await meHandler(
      { method: 'GET', params: {}, query: {}, body: undefined },
      { env: process.env, auth: { token: 'not-a-real-jwt' } },
    )
    expect(res.status).toBe(401)
    errorResponseSchema.parse(res.body)
  })
})

describe('AC-12: 무인증 mutate → 401, 행 미기록', () => {
  it('POST /api/tabs — 토큰 없으면 401이고 탭이 생성되지 않는다', async () => {
    const before = await db.from('tabs').select('tab_id', { count: 'exact', head: true })
    const res = await tabsCollectionHandler(
      { method: 'POST', params: {}, query: {}, body: { name: '무인증 탭', clientId: 'cid-x' } },
      { env: process.env, auth: { token: null } },
    )
    expect(res.status).toBe(401)
    errorResponseSchema.parse(res.body)
    const after = await db.from('tabs').select('tab_id', { count: 'exact', head: true })
    expect(after.count).toBe(before.count)
  })
})

describe('AC-9 / AC-11: 신원(created_by=user_id)과 에코가드(updated_by=clientId) 분리', () => {
  it('POST /api/tabs — created_by=user_id, updated_by=clientId (서로 다른 채널)', async () => {
    const clientId = 'cid-auth-tab'
    const res = await call(tabsCollectionHandler, 'POST', {}, { name: '신원 탭', clientId })
    expect(res.status).toBe(200)
    const tab = tabSchema.parse(res.body)
    const row = await fetchColumns<{ created_by: string | null; updated_by: string | null }>(
      'tabs',
      'created_by, updated_by',
      { tab_id: tab.tabId },
    )
    expect(row.created_by).toBe(TEST_USER_ID)
    expect(row.updated_by).toBe(clientId)
    expect(row.created_by).not.toBe(row.updated_by)
  })

  it('POST /api/tabs/:tabId/parcels/:id — parcel_settings.created_by=user_id', async () => {
    const clientId = 'cid-auth-parcel'
    const tab = await createTab('신원 필지 탭')
    const [p] = await pickParcelIds(1)
    const res = await call(
      tabParcelHandler,
      'POST',
      { tabId: tab.tabId, id: p },
      { color: 'eco', clientId },
    )
    expect(res.status).toBe(200)
    const row = await fetchColumns<{ created_by: string | null; updated_by: string | null }>(
      'parcel_settings',
      'created_by, updated_by',
      { tab_id: tab.tabId, parcel_local_id: p },
    )
    expect(row.created_by).toBe(TEST_USER_ID)
    expect(row.updated_by).toBe(clientId)
  })

  it('POST /api/tabs/:tabId/groups — parcel_groups.created_by=user_id', async () => {
    const clientId = 'cid-auth-group'
    const tab = await createTab('신원 그룹 탭')
    const [p] = await pickParcelIds(1)
    const res = await call(
      tabGroupsHandler,
      'POST',
      { tabId: tab.tabId },
      {
        groupId: 'grp_auth',
        group: { name: '신원 그룹', memo: null, color: null, style: 'fill', parcelIds: [p] },
        clientId,
      },
    )
    expect(res.status).toBe(200)
    const row = await fetchColumns<{ created_by: string | null; updated_by: string | null }>(
      'parcel_groups',
      'created_by, updated_by',
      { group_id: 'grp_auth' },
    )
    expect(row.created_by).toBe(TEST_USER_ID)
    expect(row.updated_by).toBe(clientId)
  })
})
