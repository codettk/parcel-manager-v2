import { describe, expect, it } from 'vitest'
import {
  computeBalances,
  computeItemBalance,
  type StockMovement,
} from '../../../src/utils/stockBalance'

// 명세: docs/specs/erp-inventory.md — AC-1·2 (현재고 = Σ입고 − Σ출고, 공유 순수 모듈, 서버 동형)

describe('AC-1: computeItemBalance(movements)', () => {
  it('① 입고 100 − 출고 30 = 70', () => {
    expect(
      computeItemBalance([
        { itemId: 'a', type: 'in', quantity: 100 },
        { itemId: 'a', type: 'out', quantity: 30 },
      ]),
    ).toBe(70)
  })

  it('② 입고만 = 10', () => {
    expect(computeItemBalance([{ itemId: 'a', type: 'in', quantity: 10 }])).toBe(10)
  })

  it('③ 출고가 입고를 초과 → -3 (음수 허용)', () => {
    expect(
      computeItemBalance([
        { itemId: 'a', type: 'in', quantity: 5 },
        { itemId: 'a', type: 'out', quantity: 8 },
      ]),
    ).toBe(-3)
  })

  it('④ 빈 배열 = 0', () => {
    expect(computeItemBalance([])).toBe(0)
  })

  it('음수·비유한 수량은 0으로 흡수(draft 방어)', () => {
    expect(
      computeItemBalance([
        { itemId: 'a', type: 'in', quantity: 10 },
        { itemId: 'a', type: 'in', quantity: -5 },
        { itemId: 'a', type: 'out', quantity: Number.NaN },
      ]),
    ).toBe(10)
  })
})

describe('AC-2: computeBalances(movements) — 품목별 분리 집계', () => {
  it('품목 A·B 거래가 섞여도 각각 정확히 합산', () => {
    const movements: StockMovement[] = [
      { itemId: 'A', type: 'in', quantity: 100 },
      { itemId: 'B', type: 'in', quantity: 50 },
      { itemId: 'A', type: 'out', quantity: 30 },
      { itemId: 'B', type: 'out', quantity: 60 }, // B는 음수
    ]
    expect(computeBalances(movements)).toEqual({ A: 70, B: -10 })
  })

  it('거래 없는 품목은 키 부재(호출부가 0으로 간주)', () => {
    expect(computeBalances([{ itemId: 'A', type: 'in', quantity: 5 }])).toEqual({ A: 5 })
  })

  it('빈 배열 = 빈 맵', () => {
    expect(computeBalances([])).toEqual({})
  })
})
