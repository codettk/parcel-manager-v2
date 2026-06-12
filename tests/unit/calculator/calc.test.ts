import { describe, expect, it } from 'vitest'
import {
  areaInUnit,
  computeRecipeAmount,
  formatRecipeAmount,
  sanitizeDecimalInput,
  toRecipeNumber,
} from '../../../src/features/calculator/calc'
import type { CalcRecipe } from '../../../src/types/api/calcRecipes'

// 명세: docs/specs/calculator.md — AC-1~AC-3 (순수 함수). AC-4는 calcRecipesSchema.test.ts.

function makeRecipe(patch: Partial<CalcRecipe>): CalcRecipe {
  return {
    id: 'r1',
    name: '석회',
    baseArea: 300,
    baseUnit: '㎡',
    amount: 300,
    amountUnit: 'L',
    ...patch,
  }
}

describe('AC-1: 문자열 draft — sanitize·숫자 변환 (v1 보존)', () => {
  it('sanitizeDecimalInput은 숫자·점 외 문자를 제거한다', () => {
    expect(sanitizeDecimalInput('12.a3')).toBe('12.3')
    expect(sanitizeDecimalInput('1,000원')).toBe('1000')
    expect(sanitizeDecimalInput('')).toBe('')
  })

  it('trailing dot("1.")은 입력 중간 상태로 보존된다', () => {
    expect(sanitizeDecimalInput('1.')).toBe('1.')
  })

  it('toRecipeNumber는 parseFloat ∥ 0 의미론이다', () => {
    expect(toRecipeNumber('1.')).toBe(1)
    expect(toRecipeNumber('')).toBe(0)
    expect(toRecipeNumber('0.5')).toBe(0.5)
    expect(toRecipeNumber('.')).toBe(0)
  })
})

describe('AC-2: computeRecipeAmount — baseUnit 환산 ÷ baseArea × amount', () => {
  it('① 600㎡ × {300㎡당 300} = 600', () => {
    expect(computeRecipeAmount(makeRecipe({}), 600)).toBe(600)
  })

  it("② baseUnit '평' 환산 — 600㎡(=181.5평) × {181.5평당 100} = 100", () => {
    const recipe = makeRecipe({ baseArea: 181.5, baseUnit: '평', amount: 100 })
    expect(computeRecipeAmount(recipe, 600)).toBeCloseTo(100, 10)
  })

  it('③ baseArea 0이면 0 (0 나눗셈 가드, v1 보존)', () => {
    expect(computeRecipeAmount(makeRecipe({ baseArea: 0 }), 600)).toBe(0)
  })

  it('areaInUnit 환산 계수는 v1 보존 — 평 ×0.3025, a ÷100, ha ÷10000, ㎡ 그대로', () => {
    expect(areaInUnit(1000, '㎡')).toBe(1000)
    expect(areaInUnit(1000, '평')).toBe(302.5)
    expect(areaInUnit(1000, 'a')).toBe(10)
    expect(areaInUnit(1000, 'ha')).toBe(0.1)
  })
})

describe('AC-3: formatRecipeAmount — 정수 천 단위, 소수 최대 2자리', () => {
  it('정수는 toLocaleString(ko) 천 단위 구분이다', () => {
    expect(formatRecipeAmount(1200)).toBe('1,200')
    expect(formatRecipeAmount(0)).toBe('0')
  })

  it('소수는 최대 2자리로 반올림된다', () => {
    expect(formatRecipeAmount(90.756)).toBe('90.76')
    expect(formatRecipeAmount(0.5)).toBe('0.5')
  })
})
