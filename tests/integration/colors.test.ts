import { describe, expect, it } from 'vitest'
import { colorItemHandler, colorsCollectionHandler } from '../../server/handlers/colors'
import { tabGroupsHandler, tabParcelHandler } from '../../server/handlers/tabState'
import { okResponseSchema } from '../../src/types/api/common'
import { colorsListResponseSchema } from '../../src/types/api/colors'
import { call, CLIENT_ID, createTab, db, pickParcelIds } from './helpers'

describe('AC-11: 팔레트 색 삭제 — 전 탭 settings·groups의 참조 null 처리', () => {
  it('DELETE /api/colors/:c가 색을 지우고 탭 2개의 settings와 groups의 color=c를 null로 갱신한다', async () => {
    const colorId = 'itest_c'

    // 팔레트에 테스트 색 추가 (PUT 전체 upsert)
    const existing = colorsListResponseSchema.parse(
      (await call(colorsCollectionHandler, 'GET')).body,
    )
    const putRes = await call(
      colorsCollectionHandler,
      'PUT',
      {},
      {
        colors: [...existing, { colorId, label: '삭제될 색', hex: '#ABCDEF', sortOrder: 99 }],
        clientId: CLIENT_ID,
      },
    )
    expect(putRes.status).toBe(200)
    okResponseSchema.parse(putRes.body)

    // 탭 2개에 분산된 settings + group이 색 c를 참조
    const tab1 = await createTab('AC11 탭 1')
    const tab2 = await createTab('AC11 탭 2')
    const [p1, p2] = await pickParcelIds(2)
    for (const [tabId, parcelId] of [
      [tab1.tabId, p1],
      [tab2.tabId, p2],
    ] as const) {
      const res = await call(
        tabParcelHandler,
        'POST',
        { tabId, id: parcelId },
        { color: colorId, name: '색 참조 필지', clientId: CLIENT_ID },
      )
      expect(res.status).toBe(200)
    }
    const groupRes = await call(
      tabGroupsHandler,
      'POST',
      { tabId: tab1.tabId },
      {
        groupId: 'grp_ac11',
        group: { name: '색 참조 그룹', memo: null, color: colorId, style: 'fill', parcelIds: [p1] },
        clientId: CLIENT_ID,
      },
    )
    expect(groupRes.status).toBe(200)

    // 색 삭제
    const deleteRes = await call(
      colorItemHandler,
      'DELETE',
      { id: colorId },
      { clientId: CLIENT_ID },
    )
    expect(deleteRes.status).toBe(200)
    okResponseSchema.parse(deleteRes.body)

    const colors = colorsListResponseSchema.parse((await call(colorsCollectionHandler, 'GET')).body)
    expect(colors.map((c) => c.colorId)).not.toContain(colorId)

    // 전 탭 settings의 color=c → null (행 자체는 name 보유로 보존)
    const settings = await db
      .from('parcel_settings')
      .select('tab_id, parcel_local_id, color')
      .in('tab_id', [tab1.tabId, tab2.tabId])
    if (settings.error) throw new Error(settings.error.message)
    const settingRows = (settings.data ?? []) as { color: string | null }[]
    expect(settingRows).toHaveLength(2)
    for (const row of settingRows) {
      expect(row.color).toBeNull()
    }

    const groups = await db
      .from('parcel_groups')
      .select('group_id, color')
      .eq('group_id', 'grp_ac11')
    if (groups.error) throw new Error(groups.error.message)
    expect(((groups.data ?? []) as { color: string | null }[])[0]?.color).toBeNull()
  })
})
