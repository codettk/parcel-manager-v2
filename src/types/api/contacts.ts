import { z } from 'zod'
import { mutationBodySchema } from './common.js'

/** 거래처 구분 — 매입처/매출처/양쪽 (AC-6·7) */
export const contactKindSchema = z.enum(['buy', 'sell', 'both'])
export type ContactKind = z.infer<typeof contactKindSchema>

/**
 * 거래처(매입/매출 상대처) 마스터 — `contacts` 행의 API 표현 (영농 ERP, 슬라이스 5a).
 * 전역 공유 + `createdBy` 신원(절충 1). 소프트 비활성 삭제(절충 4).
 */
export const contactSchema = z.object({
  contactId: z.string(),
  name: z.string().min(1),
  /** 담당자명 */
  manager: z.string().nullable(),
  phone: z.string().nullable(),
  kind: contactKindSchema,
  memo: z.string().nullable(),
  active: z.boolean(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Contact = z.infer<typeof contactSchema>

/** GET /api/contacts — 기본 활성만, `?includeInactive=true`면 비활성 포함 (AC-8) */
export const contactListResponseSchema = z.array(contactSchema)
export type ContactListResponse = z.infer<typeof contactListResponseSchema>

/** POST /api/contacts — 생성 (requireUser, active=true·created_by 자동, AC-6). 잘못된 kind는 400(AC-7) */
export const createContactRequestSchema = mutationBodySchema.extend({
  name: z.string().min(1),
  manager: z.string().optional(),
  phone: z.string().optional(),
  kind: contactKindSchema,
  memo: z.string().optional(),
})
export type CreateContactRequest = z.infer<typeof createContactRequestSchema>

/** PATCH /api/contacts/:id — 부분 수정 + 재활성화(active=true) (AC-9) */
export const updateContactRequestSchema = mutationBodySchema.extend({
  name: z.string().min(1).optional(),
  manager: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  kind: contactKindSchema.optional(),
  memo: z.string().nullable().optional(),
  active: z.boolean().optional(),
})
export type UpdateContactRequest = z.infer<typeof updateContactRequestSchema>

/** DELETE /api/contacts/:id — 소프트 비활성(active=false). 응답 okResponse(common) */
export const deleteContactRequestSchema = mutationBodySchema
export type DeleteContactRequest = z.infer<typeof deleteContactRequestSchema>
