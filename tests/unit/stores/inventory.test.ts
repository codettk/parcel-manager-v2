import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../src/lib/api'
import { selectBalances, useInventoryStore } from '../../../src/stores/inventory'
import type { InventoryItem } from '../../../src/types/api/inventoryItems'
import type { InventoryTransaction } from '../../../src/types/api/inventoryTransactions'

// 명세: docs/specs/erp-inventory.md — 재고 스토어 낙관적 CRUD + 현재고 파생 (AC-17 프론트분)
vi.mock('../../../src/lib/api', () => ({
  api: {
    inventoryItems: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    stockTransactions: {
      list: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
    },
  },
}))

const NOW = '2026-06-16T00:00:00.000Z'

function makeItem(itemId: string, name: string, active = true): InventoryItem {
  return {
    itemId,
    name,
    unit: '포',
    category: null,
    memo: null,
    active,
    createdBy: 'user-a',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeTxn(
  txnId: string,
  itemId: string,
  type: 'in' | 'out',
  quantity: number,
  txnDate: string,
): InventoryTransaction {
  return {
    txnId,
    itemId,
    itemNameSnapshot: '요소',
    unitSnapshot: '포',
    type,
    quantity,
    txnDate,
    contactId: null,
    contactNameSnapshot: null,
    unitPrice: null,
    amount: null,
    memo: null,
    createdBy: 'user-a',
    createdAt: NOW,
  }
}

const itemsApi = vi.mocked(api.inventoryItems)
const txnApi = vi.mocked(api.stockTransactions)

beforeEach(() => {
  useInventoryStore.setState({ items: [], transactions: [], includeInactive: false })
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('품목 낙관적 CRUD', () => {
  it('createItem — 낙관 추가 후 서버 응답으로 교체', async () => {
    const saved = makeItem('inv_real', '요소비료')
    itemsApi.create.mockResolvedValue(saved)

    const p = useInventoryStore.getState().createItem({ name: '요소비료', unit: '포' })
    // 낙관 행 즉시 반영 (임시 id)
    expect(useInventoryStore.getState().items).toHaveLength(1)
    expect(useInventoryStore.getState().items[0].name).toBe('요소비료')

    await p
    expect(useInventoryStore.getState().items).toEqual([saved])
    expect(itemsApi.create).toHaveBeenCalledWith({ name: '요소비료', unit: '포' })
  })

  it('createItem — 서버 실패 시 낙관 행 유지(롤백 없음)', async () => {
    itemsApi.create.mockRejectedValue(new Error('boom'))
    await useInventoryStore.getState().createItem({ name: '요소', unit: '포' })
    expect(useInventoryStore.getState().items).toHaveLength(1)
  })

  it('updateItem — 낙관 병합 후 서버 응답으로 교체', async () => {
    useInventoryStore.setState({ items: [makeItem('inv_1', '요소')] })
    const saved = { ...makeItem('inv_1', '고급요소'), unit: 'kg' }
    itemsApi.update.mockResolvedValue(saved)

    await useInventoryStore.getState().updateItem('inv_1', { name: '고급요소', unit: 'kg' })
    expect(useInventoryStore.getState().items[0].name).toBe('고급요소')
    expect(useInventoryStore.getState().items[0].unit).toBe('kg')
  })

  it('deactivateItem — 낙관 active=false 후 DELETE', async () => {
    useInventoryStore.setState({ items: [makeItem('inv_1', '요소')] })
    itemsApi.remove.mockResolvedValue({ ok: true })

    const p = useInventoryStore.getState().deactivateItem('inv_1')
    expect(useInventoryStore.getState().items[0].active).toBe(false)
    await p
    expect(itemsApi.remove).toHaveBeenCalledWith('inv_1')
  })
})

describe('거래 낙관적 CRUD + 현재고 파생', () => {
  it('createTransaction — 낙관 추가(스냅샷·amount 보강) 후 서버 응답으로 교체', async () => {
    const saved = makeTxn('stx_real', 'inv_1', 'in', 100, '2026-06-13')
    txnApi.create.mockResolvedValue(saved)

    const p = useInventoryStore.getState().createTransaction(
      { itemId: 'inv_1', type: 'in', quantity: 100, txnDate: '2026-06-13', unitPrice: 23000 },
      { itemName: '요소', unit: '포', contactName: '농협' },
    )
    // 낙관 행: amount = 100 × 23000, 스냅샷 보강
    const optimistic = useInventoryStore.getState().transactions[0]
    expect(optimistic.amount).toBe(2_300_000)
    expect(optimistic.contactNameSnapshot).toBe('농협')
    expect(optimistic.itemNameSnapshot).toBe('요소')

    await p
    expect(useInventoryStore.getState().transactions).toEqual([saved])
    expect(txnApi.create).toHaveBeenCalledWith({
      itemId: 'inv_1',
      type: 'in',
      quantity: 100,
      txnDate: '2026-06-13',
      unitPrice: 23000,
    })
  })

  it('AC-17: 거래 생성 시 현재고 즉시 증가(낙관) — selectBalances 파생', () => {
    useInventoryStore.setState({
      transactions: [makeTxn('stx_1', 'inv_1', 'in', 100, '2026-06-10')],
    })
    expect(selectBalances(useInventoryStore.getState().transactions)).toEqual({ inv_1: 100 })

    // 출고 30 추가 → 현재고 70
    txnApi.create.mockResolvedValue(makeTxn('stx_2', 'inv_1', 'out', 30, '2026-06-12'))
    void useInventoryStore.getState().createTransaction(
      { itemId: 'inv_1', type: 'out', quantity: 30, txnDate: '2026-06-12' },
      { itemName: '요소', unit: '포', contactName: null },
    )
    expect(selectBalances(useInventoryStore.getState().transactions)).toEqual({ inv_1: 70 })
  })

  it('AC-17/AC-11: 거래 삭제 시 현재고 즉시 감소(파생 — 자동 재계산)', async () => {
    useInventoryStore.setState({
      transactions: [
        makeTxn('stx_in', 'inv_1', 'in', 100, '2026-06-10'),
        makeTxn('stx_out', 'inv_1', 'out', 30, '2026-06-12'),
      ],
    })
    expect(selectBalances(useInventoryStore.getState().transactions)).toEqual({ inv_1: 70 })

    txnApi.remove.mockResolvedValue({ ok: true })
    const p = useInventoryStore.getState().deleteTransaction('stx_out')
    // 출고 제거 → 현재고 100 자동 재계산
    expect(selectBalances(useInventoryStore.getState().transactions)).toEqual({ inv_1: 100 })
    await p
    expect(txnApi.remove).toHaveBeenCalledWith('stx_out')
  })

  it('거래 생성 후 거래일 내림차순 정렬(서버 동형)', () => {
    useInventoryStore.setState({
      transactions: [makeTxn('stx_a', 'inv_1', 'in', 5, '2026-06-10')],
    })
    txnApi.create.mockResolvedValue(makeTxn('stx_b', 'inv_1', 'in', 5, '2026-06-15'))
    void useInventoryStore.getState().createTransaction(
      { itemId: 'inv_1', type: 'in', quantity: 5, txnDate: '2026-06-15' },
      { itemName: '요소', unit: '포', contactName: null },
    )
    const dates = useInventoryStore.getState().transactions.map((t) => t.txnDate)
    expect(dates).toEqual(['2026-06-15', '2026-06-10'])
  })
})
