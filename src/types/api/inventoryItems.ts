import { z } from 'zod'
import { mutationBodySchema } from './common.js'

/**
 * 재고 품목(농자재/농산물) 마스터 — `inventory_items` 행의 API 표현 (영농 ERP, 슬라이스 5c).
 * 전역 공유 + createdBy 신원(5a·5b 일관). 삭제는 소프트 비활성(active=false) — 과거 거래 참조 보존.
 * 현재고는 이 행에 저장하지 않는다 — 거래 원장 합산 파생(stockBalance.ts, 절충 1).
 */
export const inventoryItemSchema = z.object({
  itemId: z.string(),
  name: z.string().min(1),
  /** 단위 — 예: kg·포·박스 */
  unit: z.string().min(1),
  /** 분류 (선택) */
  category: z.string().nullable(),
  memo: z.string().nullable(),
  active: z.boolean(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type InventoryItem = z.infer<typeof inventoryItemSchema>

/** GET /api/inventory/items — 기본 활성만, `?includeInactive=true`면 비활성 포함 (AC-6) */
export const inventoryItemListResponseSchema = z.array(inventoryItemSchema)
export type InventoryItemListResponse = z.infer<typeof inventoryItemListResponseSchema>

/** POST /api/inventory/items — 생성 (requireUser, active=true·created_by 자동, AC-5) */
export const createInventoryItemRequestSchema = mutationBodySchema.extend({
  name: z.string().min(1),
  unit: z.string().min(1),
  category: z.string().optional(),
  memo: z.string().optional(),
})
export type CreateInventoryItemRequest = z.infer<typeof createInventoryItemRequestSchema>

/** PATCH /api/inventory/items/:id — 부분 수정 + 재활성화(active=true) (AC-7) */
export const updateInventoryItemRequestSchema = mutationBodySchema.extend({
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  active: z.boolean().optional(),
})
export type UpdateInventoryItemRequest = z.infer<typeof updateInventoryItemRequestSchema>

/** DELETE /api/inventory/items/:id — 소프트 비활성(active=false). 응답 okResponse (AC-7) */
export const deleteInventoryItemRequestSchema = mutationBodySchema
export type DeleteInventoryItemRequest = z.infer<typeof deleteInventoryItemRequestSchema>
