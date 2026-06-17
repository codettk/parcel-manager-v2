import { afterAll, describe, expect, it } from 'vitest'
import {
  inventoryItemsCollectionHandler,
  inventoryItemsItemHandler,
} from '../../server/handlers/inventoryItems'
import { errorResponseSchema } from '../../src/types/api/common'
import {
  inventoryItemListResponseSchema,
  inventoryItemSchema,
} from '../../src/types/api/inventoryItems'
import { call, CLIENT_ID, db, getTestToken, issueFreshToken, TEST_USER_ID } from './helpers'

const noAuthCtx = { env: process.env, auth: { token: null } }

/** 테스트가 만든 품목 행을 모두 물리 삭제(전역 공유 — 잔여가 카운트를 오염시키므로) */
async function purgeItems(): Promise<void> {
  const { error } = await db.from('inventory_items').delete().neq('item_id', '')
  if (error) throw new Error(error.message)
}

afterAll(purgeItems)

async function createItem(body: Record<string, unknown>) {
  const res = await call(inventoryItemsCollectionHandler, 'POST', {}, { clientId: CLIENT_ID, ...body })
  if (res.status !== 200) throw new Error(`품목 생성 실패: ${res.status} ${JSON.stringify(res.body)}`)
  return inventoryItemSchema.parse(res.body)
}

async function listItems(includeInactive = false) {
  const token = await getTestToken()
  const query = includeInactive ? { includeInactive: 'true' } : {}
  const res = await inventoryItemsCollectionHandler(
    { method: 'GET', params: {}, query, body: undefined },
    { env: process.env, auth: { token } },
  )
  return inventoryItemListResponseSchema.parse(res.body)
}

describe('AC-5: POST /api/inventory/items — 생성 (itemId 부여·active=true·created_by 자동)', () => {
  it('유효 세션으로 생성하면 itemId 부여·active=true·created_by가 인증 사용자', async () => {
    await getTestToken()
    const item = await createItem({
      name: '  요소비료  ',
      unit: '  포  ',
      category: '비료',
      memo: 'm',
    })
    expect(item.itemId).toMatch(/^inv_/)
    expect(item.name).toBe('요소비료') // trim
    expect(item.unit).toBe('포')
    expect(item.category).toBe('비료')
    expect(item.active).toBe(true)
    expect(item.createdBy).toBe(TEST_USER_ID)
  })

  it('빈 문자열 category/memo는 null로 정규화된다', async () => {
    const item = await createItem({ name: '빈값품목', unit: 'kg', category: '  ', memo: '' })
    expect(item.category).toBeNull()
    expect(item.memo).toBeNull()
  })

  it('name/unit이 빈 문자열이면 400 (행 미생성)', async () => {
    const res = await call(
      inventoryItemsCollectionHandler,
      'POST',
      {},
      { name: '', unit: 'kg', clientId: CLIENT_ID },
    )
    expect(res.status).toBe(400)
    errorResponseSchema.parse(res.body)
  })
})

describe('AC-6: GET /api/inventory/items — 기본 활성만 / includeInactive 전량', () => {
  it('active=false 1건은 기본 목록에서 제외되고 includeInactive=true에서 포함', async () => {
    await purgeItems()
    const a = await createItem({ name: '활성품목', unit: 'kg' })
    const b = await createItem({ name: '비활성품목', unit: 'kg' })
    await call(inventoryItemsItemHandler, 'DELETE', { id: b.itemId }, { clientId: CLIENT_ID })

    const def = await listItems()
    expect(def.map((i) => i.itemId)).toContain(a.itemId)
    expect(def.map((i) => i.itemId)).not.toContain(b.itemId)

    const all = await listItems(true)
    expect(all.map((i) => i.itemId)).toEqual(expect.arrayContaining([a.itemId, b.itemId]))
  })
})

describe('AC-7: PATCH 부분 수정·재활성화 / DELETE 소프트 비활성', () => {
  it('PATCH로 name·unit 변경이 반영되고 updatedAt이 갱신된다', async () => {
    const created = await createItem({ name: '원래명', unit: '포' })
    const res = await call(
      inventoryItemsItemHandler,
      'PATCH',
      { id: created.itemId },
      { name: '변경명', unit: 'kg', clientId: CLIENT_ID },
    )
    expect(res.status).toBe(200)
    const updated = inventoryItemSchema.parse(res.body)
    expect(updated.name).toBe('변경명')
    expect(updated.unit).toBe('kg')
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime(),
    )
  })

  it('DELETE는 물리 삭제하지 않고 active=false로 전환한다(소프트 비활성)', async () => {
    const created = await createItem({ name: '삭제대상', unit: 'kg' })
    const res = await call(
      inventoryItemsItemHandler,
      'DELETE',
      { id: created.itemId },
      { clientId: CLIENT_ID },
    )
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    // 행이 살아 있고 active=false
    const { data } = await db
      .from('inventory_items')
      .select('active')
      .eq('item_id', created.itemId)
      .maybeSingle()
    expect((data as { active: boolean }).active).toBe(false)
  })

  it('PATCH active=true로 비활성 품목을 재활성화하면 기본 목록에 다시 포함된다', async () => {
    await purgeItems()
    const created = await createItem({ name: '복귀품목', unit: 'kg' })
    await call(inventoryItemsItemHandler, 'DELETE', { id: created.itemId }, { clientId: CLIENT_ID })
    const re = await call(
      inventoryItemsItemHandler,
      'PATCH',
      { id: created.itemId },
      { active: true, clientId: CLIENT_ID },
    )
    expect(inventoryItemSchema.parse(re.body).active).toBe(true)
    const def = await listItems()
    expect(def.map((i) => i.itemId)).toContain(created.itemId)
  })

  it('없는 품목 PATCH/DELETE는 404', async () => {
    const patchRes = await call(
      inventoryItemsItemHandler,
      'PATCH',
      { id: 'inv_nope' },
      { name: 'x', clientId: CLIENT_ID },
    )
    expect(patchRes.status).toBe(404)
    const delRes = await call(
      inventoryItemsItemHandler,
      'DELETE',
      { id: 'inv_nope' },
      { clientId: CLIENT_ID },
    )
    expect(delRes.status).toBe(404)
  })
})

describe('AC-12: 무인증 mutate는 401 (행 미변경)', () => {
  it('무토큰 POST는 401이고 행이 생성되지 않는다', async () => {
    const { count: before } = await db
      .from('inventory_items')
      .select('item_id', { count: 'exact', head: true })
    const res = await inventoryItemsCollectionHandler(
      { method: 'POST', params: {}, query: {}, body: { name: '무인증', unit: 'kg', clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(res.status).toBe(401)
    errorResponseSchema.parse(res.body)
    const { count: after } = await db
      .from('inventory_items')
      .select('item_id', { count: 'exact', head: true })
    expect(after).toBe(before)
  })

  it('무토큰 PATCH·DELETE는 401이고 행이 변경되지 않는다', async () => {
    const created = await createItem({ name: '게이트품목', unit: 'kg' })
    const patchRes = await inventoryItemsItemHandler(
      { method: 'PATCH', params: { id: created.itemId }, query: {}, body: { name: 'x', clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(patchRes.status).toBe(401)
    const delRes = await inventoryItemsItemHandler(
      { method: 'DELETE', params: { id: created.itemId }, query: {}, body: { clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(delRes.status).toBe(401)
    const { data } = await db
      .from('inventory_items')
      .select('active, name')
      .eq('item_id', created.itemId)
      .maybeSingle()
    expect((data as { active: boolean; name: string }).active).toBe(true)
    expect((data as { active: boolean; name: string }).name).toBe('게이트품목')
  })
})

describe('AC-15: 전역 공유 — 다른 세션 토큰으로도 같은 품목 목록이 보인다', () => {
  it('A가 만든 품목이 새 세션 토큰 조회에도 그대로 보인다(created_by 격리 없음)', async () => {
    await purgeItems()
    const created = await createItem({ name: '공유품목', unit: 'kg' })
    const token2 = await issueFreshToken()
    const res = await inventoryItemsCollectionHandler(
      { method: 'GET', params: {}, query: {}, body: undefined },
      { env: process.env, auth: { token: token2 } },
    )
    expect(res.status).toBe(200)
    const list = inventoryItemListResponseSchema.parse(res.body)
    expect(list.map((i) => i.itemId)).toContain(created.itemId)
  })
})
