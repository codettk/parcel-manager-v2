import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { contactsCollectionHandler, contactsItemHandler } from '../../server/handlers/contacts'
import {
  inventoryItemsCollectionHandler,
  inventoryItemsItemHandler,
} from '../../server/handlers/inventoryItems'
import {
  inventoryTransactionsCollectionHandler,
  inventoryTransactionsItemHandler,
} from '../../server/handlers/inventoryTransactions'
import { errorResponseSchema } from '../../src/types/api/common'
import { contactSchema } from '../../src/types/api/contacts'
import { inventoryItemSchema } from '../../src/types/api/inventoryItems'
import {
  inventoryTransactionListResponseSchema,
  inventoryTransactionSchema,
} from '../../src/types/api/inventoryTransactions'
import { computeBalances } from '../../src/utils/stockBalance'
import { call, CLIENT_ID, db, getTestToken, issueFreshToken, TEST_USER_ID } from './helpers'

const noAuthCtx = { env: process.env, auth: { token: null } }

async function purgeTxns(): Promise<void> {
  const { error } = await db.from('inventory_transactions').delete().neq('txn_id', '')
  if (error) throw new Error(error.message)
}
async function purgeItems(): Promise<void> {
  await purgeTxns() // FK 참조 제거 먼저
  const { error } = await db.from('inventory_items').delete().neq('item_id', '')
  if (error) throw new Error(error.message)
}
async function purgeContacts(): Promise<void> {
  const { error } = await db.from('contacts').delete().neq('contact_id', '')
  if (error) throw new Error(error.message)
}

afterAll(async () => {
  await purgeTxns()
  await purgeItems()
  await purgeContacts()
})

async function createItem(name: string, unit: string) {
  const res = await call(
    inventoryItemsCollectionHandler,
    'POST',
    {},
    { name, unit, clientId: CLIENT_ID },
  )
  return inventoryItemSchema.parse(res.body)
}

async function createContact(name: string, kind: 'buy' | 'sell' | 'both') {
  const res = await call(contactsCollectionHandler, 'POST', {}, { name, kind, clientId: CLIENT_ID })
  return contactSchema.parse(res.body)
}

async function createTxn(body: Record<string, unknown>) {
  const res = await call(
    inventoryTransactionsCollectionHandler,
    'POST',
    {},
    { clientId: CLIENT_ID, ...body },
  )
  if (res.status !== 200) throw new Error(`거래 생성 실패: ${res.status} ${JSON.stringify(res.body)}`)
  return inventoryTransactionSchema.parse(res.body)
}

async function listTxns(query: Record<string, string> = {}) {
  const token = await getTestToken()
  const res = await inventoryTransactionsCollectionHandler(
    { method: 'GET', params: {}, query, body: undefined },
    { env: process.env, auth: { token } },
  )
  return inventoryTransactionListResponseSchema.parse(res.body)
}

beforeAll(async () => {
  await getTestToken()
})

describe('AC-8: POST /api/inventory/transactions — 입고 생성 (스냅샷 3종·amount·created_by)', () => {
  it('서버가 품목명·단위·거래처 상호를 스냅샷하고 amount=quantity×unitPrice를 산출한다', async () => {
    await purgeItems()
    await purgeContacts()
    const item = await createItem('요소', '포')
    const contact = await createContact('농협', 'buy')
    const txn = await createTxn({
      itemId: item.itemId,
      type: 'in',
      quantity: 100,
      txnDate: '2026-06-01',
      contactId: contact.contactId,
      unitPrice: 15000,
    })
    expect(txn.txnId).toMatch(/^stx_/)
    expect(txn.itemNameSnapshot).toBe('요소')
    expect(txn.unitSnapshot).toBe('포')
    expect(txn.contactId).toBe(contact.contactId)
    expect(txn.contactNameSnapshot).toBe('농협')
    expect(txn.unitPrice).toBe(15000)
    expect(txn.amount).toBe(1500000) // 100 × 15000
    expect(txn.createdBy).toBe(TEST_USER_ID)
  })

  it('unitPrice 미지정이면 amount는 null', async () => {
    const item = await createItem('퇴비', 'kg')
    const txn = await createTxn({ itemId: item.itemId, type: 'in', quantity: 50, txnDate: '2026-06-02' })
    expect(txn.unitPrice).toBeNull()
    expect(txn.amount).toBeNull()
  })

  it('quantity≤0·type 미허용·txnDate 형식 위반은 400', async () => {
    const item = await createItem('검증품목', 'kg')
    for (const bad of [
      { itemId: item.itemId, type: 'in', quantity: 0, txnDate: '2026-06-01' },
      { itemId: item.itemId, type: 'adjust', quantity: 1, txnDate: '2026-06-01' },
      { itemId: item.itemId, type: 'in', quantity: 1, txnDate: '2026/06/01' },
      { itemId: item.itemId, type: 'in', quantity: 1, txnDate: '2026-06-01', unitPrice: -1 },
    ]) {
      const res = await call(
        inventoryTransactionsCollectionHandler,
        'POST',
        {},
        { ...bad, clientId: CLIENT_ID },
      )
      expect(res.status).toBe(400)
    }
  })

  it('없는 품목으로 거래 생성은 404', async () => {
    const res = await call(
      inventoryTransactionsCollectionHandler,
      'POST',
      {},
      { itemId: 'inv_nope', type: 'in', quantity: 1, txnDate: '2026-06-01', clientId: CLIENT_ID },
    )
    expect(res.status).toBe(404)
  })
})

describe('AC-9: 거래처 미연결 정상 / 유형 정합 강제 없음', () => {
  it('contactId 없이 출고 생성 시 contactId·contactNameSnapshot이 null', async () => {
    const item = await createItem('상추', '박스')
    const txn = await createTxn({ itemId: item.itemId, type: 'out', quantity: 30, txnDate: '2026-06-03' })
    expect(txn.contactId).toBeNull()
    expect(txn.contactNameSnapshot).toBeNull()
  })

  it("out 거래에 kind='buy' 거래처를 연결해도 차단 없이 200 (정합 느슨)", async () => {
    const item = await createItem('고추', 'kg')
    const buyContact = await createContact('매입처전용', 'buy')
    const txn = await createTxn({
      itemId: item.itemId,
      type: 'out',
      quantity: 5,
      txnDate: '2026-06-03',
      contactId: buyContact.contactId,
    })
    expect(txn.type).toBe('out')
    expect(txn.contactId).toBe(buyContact.contactId)
    expect(txn.contactNameSnapshot).toBe('매입처전용')
  })
})

describe('AC-10: 품목별 이력·현재고 합산·기간 필터', () => {
  it('itemId 필터는 txn_date 내림차순, 현재고는 합산 파생, from/to 기간 필터', async () => {
    await purgeItems()
    const item = await createItem('비료A', '포')
    await createTxn({ itemId: item.itemId, type: 'in', quantity: 100, txnDate: '2026-06-01' })
    await createTxn({ itemId: item.itemId, type: 'out', quantity: 30, txnDate: '2026-06-10' })

    const history = await listTxns({ itemId: item.itemId })
    expect(history.map((t) => t.txnDate)).toEqual(['2026-06-10', '2026-06-01']) // DESC

    const balances = computeBalances(
      history.map((t) => ({ itemId: t.itemId, type: t.type, quantity: t.quantity })),
    )
    expect(balances[item.itemId]).toBe(70) // 100 - 30

    const ranged = await listTxns({ itemId: item.itemId, from: '2026-06-05', to: '2026-06-30' })
    expect(ranged.map((t) => t.txnDate)).toEqual(['2026-06-10'])
  })
})

describe('AC-11: 하드 삭제 후 현재고 재계산 / PATCH 라우트 없음', () => {
  it('출고 거래 하드 삭제 시 행 제거·현재고 재계산(70→100)', async () => {
    await purgeItems()
    const item = await createItem('비료B', '포')
    await createTxn({ itemId: item.itemId, type: 'in', quantity: 100, txnDate: '2026-06-01' })
    const out = await createTxn({ itemId: item.itemId, type: 'out', quantity: 30, txnDate: '2026-06-02' })

    const del = await call(
      inventoryTransactionsItemHandler,
      'DELETE',
      { id: out.txnId },
      { clientId: CLIENT_ID },
    )
    expect(del.status).toBe(200)
    expect(del.body).toEqual({ ok: true })

    const { data } = await db
      .from('inventory_transactions')
      .select('txn_id')
      .eq('txn_id', out.txnId)
      .maybeSingle()
    expect(data).toBeNull() // 물리 삭제 확인

    const history = await listTxns({ itemId: item.itemId })
    expect(history.map((t) => t.txnId)).not.toContain(out.txnId)
    const balances = computeBalances(
      history.map((t) => ({ itemId: t.itemId, type: t.type, quantity: t.quantity })),
    )
    expect(balances[item.itemId]).toBe(100)
  })

  it('PATCH /api/inventory/transactions/:id 핸들러는 405 (수정 미제공)', async () => {
    const item = await createItem('비료C', '포')
    const txn = await createTxn({ itemId: item.itemId, type: 'in', quantity: 1, txnDate: '2026-06-01' })
    const res = await call(
      inventoryTransactionsItemHandler,
      'PATCH',
      { id: txn.txnId },
      { quantity: 999, clientId: CLIENT_ID },
    )
    expect(res.status).toBe(405)
  })
})

describe('AC-12: 무인증 mutate는 401 (행 미변경)', () => {
  it('무토큰 POST·DELETE는 401이고 행이 생성·삭제되지 않는다', async () => {
    const item = await createItem('게이트', 'kg')
    const { count: before } = await db
      .from('inventory_transactions')
      .select('txn_id', { count: 'exact', head: true })
    const post = await inventoryTransactionsCollectionHandler(
      {
        method: 'POST',
        params: {},
        query: {},
        body: { itemId: item.itemId, type: 'in', quantity: 1, txnDate: '2026-06-01', clientId: CLIENT_ID },
      },
      noAuthCtx,
    )
    expect(post.status).toBe(401)
    errorResponseSchema.parse(post.body)
    const { count: after } = await db
      .from('inventory_transactions')
      .select('txn_id', { count: 'exact', head: true })
    expect(after).toBe(before)

    const made = await createTxn({ itemId: item.itemId, type: 'in', quantity: 1, txnDate: '2026-06-01' })
    const del = await inventoryTransactionsItemHandler(
      { method: 'DELETE', params: { id: made.txnId }, query: {}, body: { clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(del.status).toBe(401)
    const { data } = await db
      .from('inventory_transactions')
      .select('txn_id')
      .eq('txn_id', made.txnId)
      .maybeSingle()
    expect(data).not.toBeNull() // 삭제 안 됨
  })
})

describe('AC-13: 품목명/단위 변경·비활성 후 과거 거래 스냅샷 불변', () => {
  it('품목 PATCH·DELETE 후에도 거래 스냅샷·unitPrice·amount가 그대로이고 현재고엔 참여', async () => {
    await purgeItems()
    const item = await createItem('요소', '포')
    await createTxn({
      itemId: item.itemId,
      type: 'in',
      quantity: 10,
      txnDate: '2026-06-01',
      unitPrice: 12000,
    })

    // 마스터 변경 + 비활성
    await call(
      inventoryItemsItemHandler,
      'PATCH',
      { id: item.itemId },
      { name: '고급요소', unit: 'kg', clientId: CLIENT_ID },
    )
    await call(inventoryItemsItemHandler, 'DELETE', { id: item.itemId }, { clientId: CLIENT_ID })

    const [fetched] = await listTxns({ itemId: item.itemId })
    expect(fetched.itemNameSnapshot).toBe('요소') // 소급 안 됨
    expect(fetched.unitSnapshot).toBe('포')
    expect(fetched.unitPrice).toBe(12000)
    expect(fetched.amount).toBe(120000)

    // 비활성 품목 거래도 현재고 계산에 참여
    const balances = computeBalances([
      { itemId: fetched.itemId, type: fetched.type, quantity: fetched.quantity },
    ])
    expect(balances[item.itemId]).toBe(10)
  })
})

describe('AC-14: 거래처 상호 변경·비활성 후 거래처 스냅샷 불변', () => {
  it('거래처 PATCH(상호 변경)·DELETE(비활성) 후에도 contactNameSnapshot이 그대로', async () => {
    await purgeItems()
    await purgeContacts()
    const item = await createItem('자재', 'kg')
    const contact = await createContact('농협', 'buy')
    const made = await createTxn({
      itemId: item.itemId,
      type: 'in',
      quantity: 5,
      txnDate: '2026-06-01',
      contactId: contact.contactId,
    })

    await call(
      contactsItemHandler,
      'PATCH',
      { id: contact.contactId },
      { name: '새농협', clientId: CLIENT_ID },
    )
    await call(contactsItemHandler, 'DELETE', { id: contact.contactId }, { clientId: CLIENT_ID })

    const [fetched] = await listTxns({ itemId: item.itemId })
    expect(fetched.contactNameSnapshot).toBe('농협') // 소급 안 됨
    expect(fetched.contactId).toBe(contact.contactId) // 참조 무결
    expect(fetched.txnId).toBe(made.txnId)
  })
})

describe('AC-15: 전역 공유 — 다른 세션 토큰으로도 같은 거래가 보인다', () => {
  it('A가 만든 거래가 새 세션 토큰 조회에도 그대로 보인다(created_by 격리 없음)', async () => {
    await purgeItems()
    const item = await createItem('공유자재', 'kg')
    const txn = await createTxn({ itemId: item.itemId, type: 'in', quantity: 1, txnDate: '2026-06-01' })
    const token2 = await issueFreshToken()
    const res = await inventoryTransactionsCollectionHandler(
      { method: 'GET', params: {}, query: {}, body: undefined },
      { env: process.env, auth: { token: token2 } },
    )
    expect(res.status).toBe(200)
    const list = inventoryTransactionListResponseSchema.parse(res.body)
    expect(list.map((t) => t.txnId)).toContain(txn.txnId)
  })
})
