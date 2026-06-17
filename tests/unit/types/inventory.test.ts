import { describe, expect, it } from 'vitest'
import {
  createInventoryItemRequestSchema,
  inventoryItemSchema,
} from '../../../src/types/api/inventoryItems'
import { createInventoryTransactionRequestSchema } from '../../../src/types/api/inventoryTransactions'

// 명세: docs/specs/erp-inventory.md — AC-4 (계약 zod 검증: 빈 name/unit·잘못된 type·qty≤0·잘못된 날짜·음수 가격 거부)

const CLIENT = { clientId: 'c-1' }

describe('AC-4: inventoryItemSchema — 유효 값 통과', () => {
  it('완전한 품목 행을 파싱한다', () => {
    const parsed = inventoryItemSchema.parse({
      itemId: 'inv_x',
      name: '요소비료',
      unit: '포',
      category: '비료',
      memo: null,
      active: true,
      createdBy: null,
      createdAt: '2026-06-16T00:00:00.000Z',
      updatedAt: '2026-06-16T00:00:00.000Z',
    })
    expect(parsed.name).toBe('요소비료')
  })
})

describe('AC-4: createInventoryItemRequestSchema — 거부 케이스', () => {
  it('① 빈 name 거부', () => {
    expect(
      createInventoryItemRequestSchema.safeParse({ ...CLIENT, name: '', unit: '포' }).success,
    ).toBe(false)
  })

  it('① 빈 unit 거부', () => {
    expect(
      createInventoryItemRequestSchema.safeParse({ ...CLIENT, name: '요소', unit: '' }).success,
    ).toBe(false)
  })

  it('유효한 생성 요청은 통과', () => {
    expect(
      createInventoryItemRequestSchema.safeParse({ ...CLIENT, name: '요소', unit: '포' }).success,
    ).toBe(true)
  })
})

describe('AC-4: createInventoryTransactionRequestSchema — 거부 케이스', () => {
  const base = { ...CLIENT, itemId: 'inv_x', type: 'in' as const, quantity: 10, txnDate: '2026-06-16' }

  it('유효한 생성 요청은 통과', () => {
    expect(createInventoryTransactionRequestSchema.safeParse(base).success).toBe(true)
  })

  it('② type이 in/out 외("adjust")면 거부', () => {
    expect(
      createInventoryTransactionRequestSchema.safeParse({ ...base, type: 'adjust' }).success,
    ).toBe(false)
  })

  it('③ qty(quantity)가 0 이하면 거부', () => {
    expect(createInventoryTransactionRequestSchema.safeParse({ ...base, quantity: 0 }).success).toBe(
      false,
    )
    expect(
      createInventoryTransactionRequestSchema.safeParse({ ...base, quantity: -5 }).success,
    ).toBe(false)
  })

  it('④ txnDate가 YYYY-MM-DD가 아니면 거부', () => {
    expect(
      createInventoryTransactionRequestSchema.safeParse({ ...base, txnDate: '2026/06/16' }).success,
    ).toBe(false)
    expect(
      createInventoryTransactionRequestSchema.safeParse({ ...base, txnDate: '20260616' }).success,
    ).toBe(false)
  })

  it('⑤ unitPrice가 음수면 거부', () => {
    expect(
      createInventoryTransactionRequestSchema.safeParse({ ...base, unitPrice: -100 }).success,
    ).toBe(false)
  })

  it('거래처 미연결(contactId 생략)·단가 생략도 통과(절충 2·AC-9)', () => {
    const parsed = createInventoryTransactionRequestSchema.parse(base)
    expect(parsed.contactId).toBeUndefined()
    expect(parsed.unitPrice).toBeUndefined()
  })
})
