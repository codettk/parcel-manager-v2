import { describe, expect, it } from 'vitest'
import { sanitizeDecimalInput, toRecipeNumber } from '../../../src/features/calculator/calc'
import {
  parsePrice,
  parseQty,
  previewAmount,
} from '../../../src/features/erp/inventory/format'

// 명세: docs/specs/erp-inventory.md — AC-3 (수량·단가 draft 정규화: M-10 sanitizeDecimalInput/toRecipeNumber 재사용)

describe('AC-3: 숫자 draft 정규화 (M-10 재사용)', () => {
  it('sanitizeDecimalInput: "10.5x" → "10.5"', () => {
    expect(sanitizeDecimalInput('10.5x')).toBe('10.5')
  })

  it('toRecipeNumber: "" → 0', () => {
    expect(toRecipeNumber('')).toBe(0)
  })

  it('toRecipeNumber: "3." → 3', () => {
    expect(toRecipeNumber('3.')).toBe(3)
  })
})

describe('parseQty — 양수만 인정(계약 quantity > 0)', () => {
  it('양수 통과', () => {
    expect(parseQty('10.5')).toBe(10.5)
  })
  it('0·음수·빈 값·비숫자는 null', () => {
    expect(parseQty('0')).toBeNull()
    expect(parseQty('')).toBeNull()
    expect(parseQty('abc')).toBeNull()
  })
})

describe('parsePrice — 0 이상 정수 또는 null(계약 unitPrice int ≥ 0)', () => {
  it('빈 값은 null(단가 선택)', () => {
    expect(parsePrice('')).toBeNull()
  })
  it('소수 입력은 정수로 반올림', () => {
    expect(parsePrice('2300.4')).toBe(2300)
  })
  it('정수 통과', () => {
    expect(parsePrice('23000')).toBe(23000)
  })
})

describe('AC-18: previewAmount — 금액 = 수량 × 단가 (서버 amount 동형)', () => {
  it('수량·단가 모두 있으면 곱', () => {
    expect(previewAmount('100', '23000')).toBe(2300000)
  })
  it('단가 없으면 null', () => {
    expect(previewAmount('100', '')).toBeNull()
  })
  it('수량 없으면 null', () => {
    expect(previewAmount('', '23000')).toBeNull()
  })
})
