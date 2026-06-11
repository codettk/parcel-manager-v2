import { describe, expect, it } from 'vitest'
import {
  tabGroupsHandler,
  tabParcelHandler,
  tabResetHandler,
  tabStateHandler,
} from '../../server/handlers/tabState'
import { okResponseSchema } from '../../src/types/api/common'
import { tabStateResponseSchema } from '../../src/types/api/tabState'
import type { Group, TabStateResponse } from '../../src/types/api/tabState'
import { call, CLIENT_ID, createTab, db, pickParcelIds } from './helpers'

async function getState(tabId: string): Promise<TabStateResponse> {
  const res = await call(tabStateHandler, 'GET', { tabId })
  expect(res.status).toBe(200)
  return tabStateResponseSchema.parse(res.body)
}

describe('AC-8: 필지 설정 탭 스코프 + clear(전 의미 필드 null·pinned=false → 행 삭제)', () => {
  it('탭 A의 color 저장이 A state에만 반영되고 B에는 영향이 없다', async () => {
    const tabA = await createTab('AC8 탭 A')
    const tabB = await createTab('AC8 탭 B')
    const [p] = await pickParcelIds(1)

    const res = await call(
      tabParcelHandler,
      'POST',
      { tabId: tabA.tabId, id: p },
      { color: 'eco', clientId: CLIENT_ID },
    )
    expect(res.status).toBe(200)
    okResponseSchema.parse(res.body)

    const stateA = await getState(tabA.tabId)
    expect(stateA.overrides[p]?.color).toBe('eco')

    const stateB = await getState(tabB.tabId)
    expect(stateB.overrides[p]).toBeUndefined()
  })

  it('모든 의미 필드 null·pinned=false를 보내면 행이 삭제된다', async () => {
    const tab = await createTab('AC8 clear 탭')
    const [p] = await pickParcelIds(1)

    await call(
      tabParcelHandler,
      'POST',
      { tabId: tab.tabId, id: p },
      { color: 'sun', name: '지울 필지', clientId: CLIENT_ID },
    )
    expect((await getState(tab.tabId)).overrides[p]).toBeDefined()

    const clearRes = await call(
      tabParcelHandler,
      'POST',
      { tabId: tab.tabId, id: p },
      {
        color: null,
        style: null,
        name: null,
        memo: null,
        pinned: false,
        icon: null,
        clientId: CLIENT_ID,
      },
    )
    expect(clearRes.status).toBe(200)

    expect((await getState(tab.tabId)).overrides[p]).toBeUndefined()

    const { data, error } = await db
      .from('parcel_settings')
      .select('parcel_local_id')
      .eq('tab_id', tab.tabId)
      .eq('parcel_local_id', p)
    if (error) throw new Error(error.message)
    expect(data).toHaveLength(0)
  })
})

describe('AC-9: 그룹 upsert / group: null = 삭제', () => {
  it('group: null이면 그룹이 삭제되고, 새 groupId의 upsert는 state.groups에 나타난다', async () => {
    const tab = await createTab('AC9 그룹 탭')
    const [p] = await pickParcelIds(1)
    const seed: Group = {
      name: '지울 그룹',
      memo: null,
      color: 'eco',
      style: 'fill',
      parcelIds: [p],
    }

    const createRes = await call(
      tabGroupsHandler,
      'POST',
      { tabId: tab.tabId },
      { groupId: 'grp_ac9_del', group: seed, clientId: CLIENT_ID },
    )
    expect(createRes.status).toBe(200)
    expect((await getState(tab.tabId)).groups.grp_ac9_del).toBeDefined()

    const deleteRes = await call(
      tabGroupsHandler,
      'POST',
      { tabId: tab.tabId },
      { groupId: 'grp_ac9_del', group: null, clientId: CLIENT_ID },
    )
    expect(deleteRes.status).toBe(200)
    okResponseSchema.parse(deleteRes.body)
    expect((await getState(tab.tabId)).groups.grp_ac9_del).toBeUndefined()

    const upsert: Group = {
      name: '새 그룹',
      memo: '메모',
      color: 'sun',
      style: 'border',
      parcelIds: [p],
    }
    const upsertRes = await call(
      tabGroupsHandler,
      'POST',
      { tabId: tab.tabId },
      { groupId: 'grp_ac9_new', group: upsert, clientId: CLIENT_ID },
    )
    expect(upsertRes.status).toBe(200)

    const state = await getState(tab.tabId)
    expect(state.groups.grp_ac9_new).toEqual(upsert)
  })
})

describe('AC-10: reset — pinned 보호 + 그룹 삭제 + 스냅샷 부수효과 없음', () => {
  it("items ['color','name','memo','group'] reset이 비고정 행·그룹만 지우고 pinned 행과 app_config를 보존한다", async () => {
    const tab = await createTab('AC10 reset 탭')
    const [pPinned, pPlain] = await pickParcelIds(2)

    const pinnedBody = {
      color: 'eco',
      name: '고정 필지',
      memo: '고정 메모',
      pinned: true,
      clientId: CLIENT_ID,
    }
    expect(
      (await call(tabParcelHandler, 'POST', { tabId: tab.tabId, id: pPinned }, pinnedBody)).status,
    ).toBe(200)
    expect(
      (
        await call(
          tabParcelHandler,
          'POST',
          { tabId: tab.tabId, id: pPlain },
          { color: 'sun', name: '비고정 필지', memo: '비고정 메모', clientId: CLIENT_ID },
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await call(
          tabGroupsHandler,
          'POST',
          { tabId: tab.tabId },
          {
            groupId: 'grp_ac10',
            group: {
              name: '리셋 그룹',
              memo: null,
              color: 'eco',
              style: 'fill',
              parcelIds: [pPlain],
            },
            clientId: CLIENT_ID,
          },
        )
      ).status,
    ).toBe(200)

    const configBefore = await db.from('app_config').select('key')
    if (configBefore.error) throw new Error(configBefore.error.message)
    const keysBefore = ((configBefore.data ?? []) as { key: string }[]).map((r) => r.key).sort()

    const resetRes = await call(
      tabResetHandler,
      'POST',
      { tabId: tab.tabId },
      { items: ['color', 'name', 'memo', 'group'], clientId: CLIENT_ID },
    )
    expect(resetRes.status).toBe(200)
    okResponseSchema.parse(resetRes.body)

    const state = await getState(tab.tabId)
    // 비고정 행·그룹 삭제
    expect(state.overrides[pPlain]).toBeUndefined()
    expect(Object.keys(state.groups)).toHaveLength(0)
    // pinned 행의 color/name/memo 보존
    expect(state.overrides[pPinned]?.color).toBe('eco')
    expect(state.overrides[pPinned]?.name).toBe('고정 필지')
    expect(state.overrides[pPinned]?.memo).toBe('고정 메모')
    expect(state.overrides[pPinned]?.pinned).toBe(true)

    // v1 스냅샷 부수효과 제거 — app_config에 새 키가 생기지 않는다
    const configAfter = await db.from('app_config').select('key')
    if (configAfter.error) throw new Error(configAfter.error.message)
    const keysAfter = ((configAfter.data ?? []) as { key: string }[]).map((r) => r.key).sort()
    expect(keysAfter).toEqual(keysBefore)
  })
})
