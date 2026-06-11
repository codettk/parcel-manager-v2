import { z } from 'zod'
import { mutationBodySchema } from './common'

export const tabSchema = z.object({
  tabId: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  /** NULL=활성, 값=히스토리(소프트 클로즈) — ISO 문자열 */
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string(),
})
export type Tab = z.infer<typeof tabSchema>

/** GET /api/tabs — 활성 탭 목록 (sort_order 순, 0개면 기본 탭 자동 생성) */
export const tabsListResponseSchema = z.array(tabSchema)
export type TabsListResponse = z.infer<typeof tabsListResponseSchema>

/** POST /api/tabs */
export const createTabRequestSchema = mutationBodySchema.extend({
  name: z.string().min(1).optional(),
})
export type CreateTabRequest = z.infer<typeof createTabRequestSchema>

/** PATCH /api/tabs/:id */
export const updateTabRequestSchema = mutationBodySchema.extend({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
})
export type UpdateTabRequest = z.infer<typeof updateTabRequestSchema>

/** DELETE /api/tabs/:id — 소프트 클로즈. 마지막 활성 탭이면 409 */
export const deleteTabRequestSchema = mutationBodySchema
export type DeleteTabRequest = z.infer<typeof deleteTabRequestSchema>
