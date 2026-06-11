import { z } from 'zod'
import { mutationBodySchema } from './common'

/** 레시피 상세 구조는 M-14(계산기)에서 확정 — Phase 3은 jsonb 통과 계약만 */
export const calcRecipesValueSchema = z.unknown()

/** GET /api/calc-recipes — app_config['calc_recipes'].value (미설정이면 null) */
export const calcRecipesResponseSchema = z.object({
  recipes: calcRecipesValueSchema,
})
export type CalcRecipesResponse = z.infer<typeof calcRecipesResponseSchema>

/** PUT /api/calc-recipes */
export const putCalcRecipesRequestSchema = mutationBodySchema.extend({
  recipes: calcRecipesValueSchema,
})
export type PutCalcRecipesRequest = z.infer<typeof putCalcRecipesRequestSchema>
