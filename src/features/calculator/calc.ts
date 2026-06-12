// 자동 계산기 순수 로직 (M-10) — React 비의존. v1 CalculatorResultSheet/SettingsSheet 의미론 보존
import { calcRecipeSchema, type CalcRecipe } from '../../types/api/calcRecipes'

export type CalcBaseUnit = CalcRecipe['baseUnit']

/** 기준단위 셀렉트 옵션 — zod enum과 단일 소스 */
export const BASE_UNIT_OPTIONS: readonly CalcBaseUnit[] = calcRecipeSchema.shape.baseUnit.options

/** 투입 단위 추천 목록 (v1 datalist 보존) */
export const AMOUNT_UNIT_SUGGESTIONS = ['kg', 'g', 'L', 'mL', '포대', '주', '개', 't'] as const

/** 숫자 입력 필터 (v1 보존) — 문자열 draft라 trailing dot("1.") 중간 상태가 살아남는다 */
export function sanitizeDecimalInput(value: string): string {
  return value.replace(/[^0-9.]/g, '')
}

/** 문자열 draft → 저장 숫자 (v1 보존: parseFloat ∥ 0 — 빈 문자열·점만 있는 입력은 0) */
export function toRecipeNumber(value: string): number {
  return parseFloat(value) || 0
}

/**
 * ㎡ → 레시피 baseUnit(단위 라벨) 환산 (v1 areaInUnit 보존).
 * formatArea.ts의 convert와 동일 계수지만 입력 키가 단위 라벨('㎡'…)이라 별도 함수다
 */
export function areaInUnit(m2: number, baseUnit: CalcBaseUnit): number {
  if (baseUnit === '평') return m2 * 0.3025
  if (baseUnit === 'a') return m2 / 100
  if (baseUnit === 'ha') return m2 / 10000
  return m2
}

/** 결과 = (면적㎡을 baseUnit으로 환산 ÷ baseArea) × amount. baseArea ≤ 0이면 0 (v1 보존) */
export function computeRecipeAmount(recipe: CalcRecipe, areaM2: number): number {
  if (recipe.baseArea <= 0) return 0
  return (areaInUnit(areaM2, recipe.baseUnit) / recipe.baseArea) * recipe.amount
}

/** 정수면 천 단위 구분, 소수면 최대 2자리 (v1 결과 행 포맷 보존) */
export function formatRecipeAmount(value: number): string {
  return value % 1 === 0
    ? value.toLocaleString('ko')
    : value.toLocaleString('ko', { maximumFractionDigits: 2 })
}
