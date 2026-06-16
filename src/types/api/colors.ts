import { z } from 'zod'
import { mutationBodySchema } from './common.js'

/** 팔레트 색 — hex는 DB(color_labels) 소관이라 디자인 토큰이 아님 */
export const colorLabelSchema = z.object({
  colorId: z.string().min(1),
  label: z.string().min(1),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sortOrder: z.number().int(),
})
export type ColorLabel = z.infer<typeof colorLabelSchema>

/** GET /api/colors */
export const colorsListResponseSchema = z.array(colorLabelSchema)
export type ColorsListResponse = z.infer<typeof colorsListResponseSchema>

/** PUT /api/colors — 전체 upsert (라벨·hex·순서) */
export const putColorsRequestSchema = mutationBodySchema.extend({
  colors: z.array(colorLabelSchema),
})
export type PutColorsRequest = z.infer<typeof putColorsRequestSchema>

/** DELETE /api/colors/:id — 삭제 + 전 탭 settings/groups의 해당 color 참조 null 처리 */
export const deleteColorRequestSchema = mutationBodySchema
export type DeleteColorRequest = z.infer<typeof deleteColorRequestSchema>
