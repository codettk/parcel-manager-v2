import { describe, expect, it } from 'vitest'
import { colorItemHandler, colorsCollectionHandler } from '../../server/handlers/colors'
import { tabGroupsHandler, tabParcelHandler } from '../../server/handlers/tabState'
import { okResponseSchema } from '../../src/types/api/common'
import { colorsListResponseSchema } from '../../src/types/api/colors'
import { call, CLIENT_ID, createTab, db, pickParcelIds, sql } from './helpers'

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

describe('M-6 AC-7: DELETE 시 old 레코드의 updated_by = 삭제 요청자', () => {
  // REPLICA IDENTITY FULL이 Realtime DELETE payload에 싣는 old 레코드는 삭제 직전 행 값이다.
  // 핸들러의 "삭제 직전 UPDATE"가 없으면 old.updated_by는 마지막 PUT 클라이언트가 되어,
  // 마지막 수정자(타 클라이언트)가 원격 삭제를 자기 에코로 오인해 무시한다 — 그 회귀를 고정한다.
  // BEFORE DELETE 트리거로 삭제 직전 행(=Realtime old 레코드와 동일)을 캡처해 검증한다.
  it('마지막 PUT 클라이언트가 아니라 DELETE 요청 clientId가 삭제 직전 행에 기록된다', async () => {
    const colorId = 'itest_del_actor'
    const lastPutClient = 'cid-last-put'
    const deleterClient = 'cid-deleter'

    const putRes = await call(
      colorsCollectionHandler,
      'PUT',
      {},
      {
        colors: [{ colorId, label: '삭제 행위자 검증', hex: '#445566', sortOrder: 97 }],
        clientId: lastPutClient,
      },
    )
    expect(putRes.status).toBe(200)

    sql(`
      create table if not exists itest_color_delete_audit (color_id text, updated_by text);
      create or replace function itest_capture_color_delete() returns trigger as $$
      begin
        insert into itest_color_delete_audit values (old.color_id, old.updated_by);
        return old;
      end;
      $$ language plpgsql;
      drop trigger if exists itest_color_delete_trg on color_labels;
      create trigger itest_color_delete_trg before delete on color_labels
        for each row execute function itest_capture_color_delete();
    `)
    try {
      const deleteRes = await call(
        colorItemHandler,
        'DELETE',
        { id: colorId },
        { clientId: deleterClient },
      )
      expect(deleteRes.status).toBe(200)
      okResponseSchema.parse(deleteRes.body)

      const captured = sql(
        `select updated_by from itest_color_delete_audit where color_id = '${colorId}'`,
      )
      expect(captured).toHaveLength(1)
      expect(captured[0][0]).toBe(deleterClient)
    } finally {
      sql(`
        drop trigger if exists itest_color_delete_trg on color_labels;
        drop function if exists itest_capture_color_delete();
        drop table if exists itest_color_delete_audit;
      `)
    }
  })
})
