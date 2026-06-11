import { z } from 'zod'
import { mutationBodySchema } from './common'

export const parcelStyleSchema = z.enum(['fill', 'border'])
export type ParcelStyle = z.infer<typeof parcelStyleSchema>

/** 필지별 편집 설정 (탭 스코프) — parcel_settings 행의 API 표현 */
export const parcelOverrideSchema = z.object({
  color: z.string().nullable(),
  style: parcelStyleSchema.nullable(),
  name: z.string().nullable(),
  memo: z.string().nullable(),
  pinned: z.boolean(),
  icon: z.string().nullable(),
})
export type ParcelOverride = z.infer<typeof parcelOverrideSchema>

/** 그룹 (탭 스코프) — parcel_groups 행의 API 표현 (group_id는 키로만 다닌다) */
export const groupSchema = z.object({
  name: z.string().nullable(),
  memo: z.string().nullable(),
  color: z.string().nullable(),
  style: parcelStyleSchema,
  parcelIds: z.array(z.string()),
})
export type Group = z.infer<typeof groupSchema>

/** GET /api/tabs/:tabId/state — 탭 초기 로드 */
export const tabStateResponseSchema = z.object({
  overrides: z.record(z.string(), parcelOverrideSchema),
  groups: z.record(z.string(), groupSchema),
})
export type TabStateResponse = z.infer<typeof tabStateResponseSchema>

/**
 * POST /api/tabs/:tabId/parcels/:id — upsert.
 * 모든 의미 필드가 null이고 pinned=false면 행 삭제(clear)
 */
export const upsertParcelRequestSchema = mutationBodySchema.extend({
  color: z.string().nullable().optional(),
  style: parcelStyleSchema.nullable().optional(),
  name: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  icon: z.string().nullable().optional(),
})
export type UpsertParcelRequest = z.infer<typeof upsertParcelRequestSchema>

/** POST /api/tabs/:tabId/groups — upsert / group: null = 삭제 */
export const upsertGroupRequestSchema = mutationBodySchema.extend({
  groupId: z.string().min(1),
  group: groupSchema.nullable(),
})
export type UpsertGroupRequest = z.infer<typeof upsertGroupRequestSchema>

export const resetItemSchema = z.enum(['color', 'name', 'memo', 'group'])
export type ResetItem = z.infer<typeof resetItemSchema>

/** POST /api/tabs/:tabId/reset — 선택 초기화. pinned=true 행의 color/name/memo는 보존 */
export const resetTabRequestSchema = mutationBodySchema.extend({
  items: z.array(resetItemSchema).min(1),
})
export type ResetTabRequest = z.infer<typeof resetTabRequestSchema>

/** PUT /api/tabs/:tabId/import — 탭의 settings/groups 전체 교체 (파일 포맷 검증 상세는 M-12) */
export const importTabRequestSchema = mutationBodySchema.extend({
  overrides: z.record(z.string(), parcelOverrideSchema),
  groups: z.record(z.string(), groupSchema),
})
export type ImportTabRequest = z.infer<typeof importTabRequestSchema>
