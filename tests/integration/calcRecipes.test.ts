import { describe, expect, it } from 'vitest'
import { calcRecipesHandler } from '../../server/handlers/calcRecipes'
import { calcRecipesResponseSchema } from '../../src/types/api/calcRecipes'
import { errorResponseSchema, okResponseSchema } from '../../src/types/api/common'
import { call, CLIENT_ID } from './helpers'

// 명세: docs/specs/calculator.md — AC-10 (핸들러 통합: z.unknown() → 구체 스키마 회귀 확인).
// clientId 누락 400은 tests/unit/handlers/validation.test.ts 소관 (DB 비의존 — 단위 레벨).

/** v1 저장 형식 호환 — baseUnit은 단위 라벨, 빈 name 허용 (결과에서 '(이름 없음)') */
const RECIPES = [
  { id: 'r-itest-lime', name: '석회', baseArea: 300, baseUnit: '㎡', amount: 300, amountUnit: 'L' },
  { id: 'r-itest-fert', name: '', baseArea: 181.5, baseUnit: '평', amount: 20, amountUnit: 'kg' },
]

describe('AC-10: PUT·GET /api/calc-recipes — 구체화 스키마', () => {
  it('유효 레시피 배열을 PUT 후 GET하면 동일 배열이 반환된다 (계약 parse 왕복)', async () => {
    const putRes = await call(
      calcRecipesHandler,
      'PUT',
      {},
      { recipes: RECIPES, clientId: CLIENT_ID },
    )
    expect(putRes.status).toBe(200)
    okResponseSchema.parse(putRes.body)

    const getRes = await call(calcRecipesHandler, 'GET')
    expect(getRes.status).toBe(200)
    const parsed = calcRecipesResponseSchema.parse(getRes.body)
    expect(parsed.recipes).toEqual(RECIPES)
  })

  it('baseUnit 비허용 값 PUT은 400이고 저장값은 불변이다', async () => {
    // Given: 유효 저장 상태
    await call(calcRecipesHandler, 'PUT', {}, { recipes: RECIPES, clientId: CLIENT_ID })

    const invalid = [{ ...RECIPES[0], baseUnit: 'acre' }]
    const res = await call(calcRecipesHandler, 'PUT', {}, { recipes: invalid, clientId: CLIENT_ID })
    expect(res.status).toBe(400)
    errorResponseSchema.parse(res.body)

    // 검증은 DB 접근보다 먼저 — 거부된 본문이 저장값을 덮지 않는다
    const getRes = await call(calcRecipesHandler, 'GET')
    expect(calcRecipesResponseSchema.parse(getRes.body).recipes).toEqual(RECIPES)
  })
})
