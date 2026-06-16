import { z } from 'zod'
import { mutationBodySchema } from './common.js'
import { tabSchema } from './tabs.js'

/** 닫힌 탭 — closedAt이 항상 존재 */
export const historyItemSchema = tabSchema.extend({
  closedAt: z.string(),
})
export type HistoryItem = z.infer<typeof historyItemSchema>

/** GET /api/history — closed_at 有, history_deleted_at 無 (최근 닫힌 순) */
export const historyListResponseSchema = z.array(historyItemSchema)
export type HistoryListResponse = z.infer<typeof historyListResponseSchema>

/** PATCH /api/history/:id — 이름 변경 */
export const renameHistoryRequestSchema = mutationBodySchema.extend({
  name: z.string().min(1),
})
export type RenameHistoryRequest = z.infer<typeof renameHistoryRequestSchema>

/** POST /api/history/:id/restore — 새 탭으로 복원 (group_id 전부 재생성), 응답은 새 Tab */
export const restoreHistoryRequestSchema = mutationBodySchema
export type RestoreHistoryRequest = z.infer<typeof restoreHistoryRequestSchema>

/** DELETE /api/history/:id — 소프트 딜리트(history_deleted_at), 행은 보존 */
export const deleteHistoryRequestSchema = mutationBodySchema
export type DeleteHistoryRequest = z.infer<typeof deleteHistoryRequestSchema>
