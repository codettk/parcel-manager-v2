import { z } from 'zod'
import { mutationBodySchema } from './common.js'

/**
 * 자동 계산기 레시피 (M-10에서 확정 — Phase 3의 z.unknown() 통과 계약을 구체화).
 * baseUnit은 v1 데이터 호환을 위해 단위 라벨 문자열을 그대로 저장한다 (§8.1 시드 무변환)
 */
export const calcRecipeSchema = z.object({
  id: z.string().min(1),
  /** 빈 문자열 허용 — 표시 시 '(이름 없음)' 폴백 */
  name: z.string().max(12),
  baseArea: z.number().nonnegative(),
  baseUnit: z.enum(['㎡', '평', 'a', 'ha']),
  amount: z.number().nonnegative(),
  amountUnit: z.string().max(6),
})
export type CalcRecipe = z.infer<typeof calcRecipeSchema>

export const calcRecipesValueSchema = z.array(calcRecipeSchema)

/** GET /api/calc-recipes — app_config['calc_recipes'].value (미설정이면 null) */
export const calcRecipesResponseSchema = z.object({
  recipes: calcRecipesValueSchema.nullable(),
})
export type CalcRecipesResponse = z.infer<typeof calcRecipesResponseSchema>

/** PUT /api/calc-recipes */
export const putCalcRecipesRequestSchema = mutationBodySchema.extend({
  recipes: calcRecipesValueSchema,
})
export type PutCalcRecipesRequest = z.infer<typeof putCalcRecipesRequestSchema>
