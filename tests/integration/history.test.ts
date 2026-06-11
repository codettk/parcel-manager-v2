import { describe, expect, it } from 'vitest'
import {
  historyCollectionHandler,
  historyItemHandler,
  historyRestoreHandler,
} from '../../server/handlers/history'
import { tabGroupsHandler, tabParcelHandler, tabStateHandler } from '../../server/handlers/tabState'
import { tabItemHandler } from '../../server/handlers/tabs'
import { okResponseSchema } from '../../src/types/api/common'
import { historyItemSchema, historyListResponseSchema } from '../../src/types/api/history'
import { tabSchema } from '../../src/types/api/tabs'
import { tabStateResponseSchema } from '../../src/types/api/tabState'
import type { Group } from '../../src/types/api/tabState'
import { call, CLIENT_ID, createTab, db, ensureSingleActiveTab, pickParcelIds } from './helpers'

/** 탭을 생성해 닫힌(히스토리) 상태로 만든다 — DELETE 허용을 위해 활성 탭 1개를 따로 보장 */
async function createClosedTab(name: string): Promise<string> {
  await ensureSingleActiveTab()
  const tab = await createTab(name)
  const res = await call(tabItemHandler, 'DELETE', { id: tab.tabId }, { clientId: CLIENT_ID })
  expect(res.status).toBe(200)
  return tab.tabId
}

describe('AC-6: 히스토리 복원 — settings/groups 복사 + group_id 전부 재생성', () => {
  it('restore가 새 탭을 만들고 settings n개·groups m개를 복사하며 group_id는 원본과 겹치지 않는다', async () => {
    await ensureSingleActiveTab()
    const source = await createTab('AC6 원본 탭')
    const [p1, p2] = await pickParcelIds(2)

    for (const [parcelId, body] of [
      [p1, { color: 'eco', name: '필지 하나', clientId: CLIENT_ID }],
      [p2, { memo: '메모 둘', pinned: true, clientId: CLIENT_ID }],
    ] as const) {
      const res = await call(tabParcelHandler, 'POST', { tabId: source.tabId, id: parcelId }, body)
      expect(res.status).toBe(200)
    }

    const originalGroups: Record<string, Group> = {
      grp_ac6_one: { name: '그룹 하나', memo: null, color: 'eco', style: 'fill', parcelIds: [p1] },
      grp_ac6_two: {
        name: '그룹 둘',
        memo: '둘 메모',
        color: 'sun',
        style: 'border',
        parcelIds: [p1, p2],
      },
    }
    for (const [groupId, group] of Object.entries(originalGroups)) {
      const res = await call(
        tabGroupsHandler,
        'POST',
        { tabId: source.tabId },
        { groupId, group, clientId: CLIENT_ID },
      )
      expect(res.status).toBe(200)
    }

    const closeRes = await call(
      tabItemHandler,
      'DELETE',
      { id: source.tabId },
      { clientId: CLIENT_ID },
    )
    expect(closeRes.status).toBe(200)

    const restoreRes = await call(
      historyRestoreHandler,
      'POST',
      { id: source.tabId },
      { clientId: CLIENT_ID },
    )
    expect(restoreRes.status).toBe(200)
    const restored = tabSchema.parse(restoreRes.body)
    expect(restored.tabId).not.toBe(source.tabId)
    expect(restored.closedAt).toBeNull()
    expect(restored.name).toBe('AC6 원본 탭')

    const stateRes = await call(tabStateHandler, 'GET', { tabId: restored.tabId })
    expect(stateRes.status).toBe(200)
    const state = tabStateResponseSchema.parse(stateRes.body)

    // settings n=2 복사
    expect(Object.keys(state.overrides).sort()).toEqual([p1, p2].sort())
    expect(state.overrides[p1].color).toBe('eco')
    expect(state.overrides[p1].name).toBe('필지 하나')
    expect(state.overrides[p2].memo).toBe('메모 둘')
    expect(state.overrides[p2].pinned).toBe(true)

    // groups m=2 복사 + group_id 전부 재생성 (원본 집합과 비교차)
    const copiedIds = Object.keys(state.groups)
    expect(copiedIds).toHaveLength(2)
    for (const id of copiedIds) {
      expect(Object.keys(originalGroups)).not.toContain(id)
    }
    for (const original of Object.values(originalGroups)) {
      const copied = Object.values(state.groups).find((g) => g.name === original.name)
      expect(copied).toBeDefined()
      expect(copied?.parcelIds).toEqual(original.parcelIds)
      expect(copied?.color).toBe(original.color)
    }
  })
})

describe('AC-7: 히스토리 이름 변경 + 소프트 딜리트', () => {
  it('PATCH로 바꾼 이름이 재조회에 반영된다', async () => {
    const closedId = await createClosedTab('AC7 이름 변경 전')

    const patchRes = await call(
      historyItemHandler,
      'PATCH',
      { id: closedId },
      { name: 'AC7 이름 변경 후', clientId: CLIENT_ID },
    )
    expect(patchRes.status).toBe(200)
    expect(historyItemSchema.parse(patchRes.body).name).toBe('AC7 이름 변경 후')

    const history = historyListResponseSchema.parse(
      (await call(historyCollectionHandler, 'GET')).body,
    )
    expect(history.find((h) => h.tabId === closedId)?.name).toBe('AC7 이름 변경 후')
  })

  it('DELETE하면 히스토리 목록에서 빠지지만 행은 history_deleted_at과 함께 DB에 남는다', async () => {
    const closedId = await createClosedTab('AC7 삭제 대상')

    const deleteRes = await call(
      historyItemHandler,
      'DELETE',
      { id: closedId },
      { clientId: CLIENT_ID },
    )
    expect(deleteRes.status).toBe(200)
    okResponseSchema.parse(deleteRes.body)

    const history = historyListResponseSchema.parse(
      (await call(historyCollectionHandler, 'GET')).body,
    )
    expect(history.map((h) => h.tabId)).not.toContain(closedId)

    const { data, error } = await db
      .from('tabs')
      .select('history_deleted_at')
      .eq('tab_id', closedId)
      .single()
    if (error) throw new Error(error.message)
    expect((data as { history_deleted_at: string | null }).history_deleted_at).not.toBeNull()
  })
})
