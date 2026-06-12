import { describe, expect, it } from 'vitest'
import {
  calcRecipesResponseSchema,
  calcRecipesValueSchema,
  putCalcRecipesRequestSchema,
} from '../../../src/types/api/calcRecipes'

// 명세: docs/specs/calculator.md — AC-4 (계약 구체화: v1 저장 형식 호환 + PUT 검증 실질화)

/** v1 app_config.calc_recipes 저장 형식 — baseUnit은 단위 라벨, id는 'r_'+Date.now() (§8.1 시드 무변환) */
const V1_RECIPES = [
  {
    id: 'r_1718000000000',
    name: '석회',
    baseArea: 300,
    baseUnit: '㎡',
    amount: 300,
    amountUnit: 'L',
  },
  { id: 'r_1718000000001', name: '', baseArea: 1, baseUnit: '평', amount: 0.5, amountUnit: 'mL' },
]

describe('AC-4: calcRecipes zod 계약', () => {
  it('v1 저장 형식 레시피 배열이 통과한다 (빈 name·소수 amount 포함)', () => {
    expect(calcRecipesValueSchema.safeParse(V1_RECIPES).success).toBe(true)
  })

  it('GET 응답은 recipes: null(미설정)을 통과시킨다', () => {
    expect(calcRecipesResponseSchema.safeParse({ recipes: null }).success).toBe(true)
    expect(calcRecipesResponseSchema.safeParse({ recipes: V1_RECIPES }).success).toBe(true)
  })

  it("PUT 요청은 baseUnit 비허용 값('m2')을 거부한다", () => {
    const body = {
      clientId: 'c1',
      recipes: [{ ...V1_RECIPES[0], baseUnit: 'm2' }],
    }
    expect(putCalcRecipesRequestSchema.safeParse(body).success).toBe(false)
  })

  it('PUT 요청은 음수 baseArea를 거부한다', () => {
    const body = {
      clientId: 'c1',
      recipes: [{ ...V1_RECIPES[0], baseArea: -1 }],
    }
    expect(putCalcRecipesRequestSchema.safeParse(body).success).toBe(false)
  })

  it('PUT 요청은 13자 name을 거부한다 (최대 12자)', () => {
    const body = {
      clientId: 'c1',
      recipes: [{ ...V1_RECIPES[0], name: '가'.repeat(13) }],
    }
    expect(putCalcRecipesRequestSchema.safeParse(body).success).toBe(false)
    expect(
      putCalcRecipesRequestSchema.safeParse({
        clientId: 'c1',
        recipes: [{ ...V1_RECIPES[0], name: '가'.repeat(12) }],
      }).success,
    ).toBe(true)
  })
})
