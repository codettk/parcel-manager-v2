import { describe, expect, it } from 'vitest'
import { colorsCollectionHandler } from '../../server/handlers/colors'
import { tabGroupsHandler, tabParcelHandler, tabResetHandler } from '../../server/handlers/tabState'
import { tabsCollectionHandler } from '../../server/handlers/tabs'
import { okResponseSchema } from '../../src/types/api/common'
import { tabSchema } from '../../src/types/api/tabs'
import { call, createTab, db, pickParcelIds } from './helpers'

// clientId 누락 → 400 경로는 tests/unit/handlers/validation.test.ts에서 커버 (중복 작성 금지).
// 통합 레벨에서는 성공 경로의 updated_by = clientId 기록을 DB로 확인한다 (Realtime 에코 가드 전제).

async function fetchUpdatedBy(
  table: string,
  filters: Record<string, string>,
): Promise<string | null> {
  let query = db.from(table).select('updated_by')
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value)
  }
  const { data, error } = await query.single()
  if (error) throw new Error(error.message)
  return (data as { updated_by: string | null }).updated_by
}

describe('AC-12: mutate 성공 시 updated_by = clientId 기록', () => {
  it('POST /api/tabs — tabs.updated_by에 기록된다', async () => {
    const clientId = 'cid-tabs-create'
    const res = await call(tabsCollectionHandler, 'POST', {}, { name: 'AC12 탭', clientId })
    expect(res.status).toBe(200)
    const tab = tabSchema.parse(res.body)
    expect(tab.updatedBy).toBe(clientId)
    expect(await fetchUpdatedBy('tabs', { tab_id: tab.tabId })).toBe(clientId)
  })

  it('POST /api/tabs/:tabId/parcels/:id — parcel_settings.updated_by에 기록된다', async () => {
    const clientId = 'cid-parcel-upsert'
    const tab = await createTab('AC12 필지 탭')
    const [p] = await pickParcelIds(1)
    const res = await call(
      tabParcelHandler,
      'POST',
      { tabId: tab.tabId, id: p },
      { color: 'eco', clientId },
    )
    expect(res.status).toBe(200)
    expect(await fetchUpdatedBy('parcel_settings', { tab_id: tab.tabId, parcel_local_id: p })).toBe(
      clientId,
    )
  })

  it('POST /api/tabs/:tabId/groups — parcel_groups.updated_by에 기록된다', async () => {
    const clientId = 'cid-group-upsert'
    const tab = await createTab('AC12 그룹 탭')
    const [p] = await pickParcelIds(1)
    const res = await call(
      tabGroupsHandler,
      'POST',
      { tabId: tab.tabId },
      {
        groupId: 'grp_ac12',
        group: { name: 'AC12 그룹', memo: null, color: null, style: 'fill', parcelIds: [p] },
        clientId,
      },
    )
    expect(res.status).toBe(200)
    expect(await fetchUpdatedBy('parcel_groups', { group_id: 'grp_ac12' })).toBe(clientId)
  })

  it('POST /api/tabs/:tabId/reset — 패치된 비고정 행의 updated_by에 기록된다', async () => {
    const clientId = 'cid-reset'
    const tab = await createTab('AC12 reset 탭')
    const [p] = await pickParcelIds(1)
    // color reset 후에도 name이 남아 행이 보존되도록 구성
    await call(
      tabParcelHandler,
      'POST',
      { tabId: tab.tabId, id: p },
      { color: 'eco', name: '남는 이름', clientId: 'cid-before-reset' },
    )
    const res = await call(
      tabResetHandler,
      'POST',
      { tabId: tab.tabId },
      { items: ['color'], clientId },
    )
    expect(res.status).toBe(200)
    expect(await fetchUpdatedBy('parcel_settings', { tab_id: tab.tabId, parcel_local_id: p })).toBe(
      clientId,
    )
  })

  it('PUT /api/colors — color_labels.updated_by에 기록된다', async () => {
    const clientId = 'cid-colors-put'
    const res = await call(
      colorsCollectionHandler,
      'PUT',
      {},
      {
        colors: [{ colorId: 'itest_cid', label: 'AC12 색', hex: '#112233', sortOrder: 98 }],
        clientId,
      },
    )
    expect(res.status).toBe(200)
    okResponseSchema.parse(res.body)
    expect(await fetchUpdatedBy('color_labels', { color_id: 'itest_cid' })).toBe(clientId)
  })
})
