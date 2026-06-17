import { z } from 'zod'
import { mutationBodySchema } from './common.js'

/**
 * 인력(일꾼/근로자) 마스터 — `staff` 행의 API 표현 (영농 ERP, 슬라이스 5a).
 * 전역 공유(작업공간 단위 협업 데이터, 격리 없음) + `createdBy` 신원만 부착(절충 1).
 * 삭제는 소프트 비활성(`active=false`) — 하드 삭제 없음(5b 일당계산 외래 참조 보존, 절충 4).
 */
export const staffSchema = z.object({
  staffId: z.string(),
  name: z.string().min(1),
  phone: z.string().nullable(),
  /** 역할/직종 (예: 작업반장·일용) */
  role: z.string().nullable(),
  /** 기본 일당(원) — 5b 일당계산 기본값. null=미설정 */
  dailyWage: z.number().int().nonnegative().nullable(),
  memo: z.string().nullable(),
  active: z.boolean(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Staff = z.infer<typeof staffSchema>

/** GET /api/staff — 기본 활성만, `?includeInactive=true`면 비활성 포함 (AC-2) */
export const staffListResponseSchema = z.array(staffSchema)
export type StaffListResponse = z.infer<typeof staffListResponseSchema>

/** POST /api/staff — 생성 (requireUser, active=true·created_by 자동, AC-1) */
export const createStaffRequestSchema = mutationBodySchema.extend({
  name: z.string().min(1),
  phone: z.string().optional(),
  role: z.string().optional(),
  dailyWage: z.number().int().nonnegative().optional(),
  memo: z.string().optional(),
})
export type CreateStaffRequest = z.infer<typeof createStaffRequestSchema>

/** PATCH /api/staff/:id — 부분 수정 + 재활성화(active=true) (AC-3·9 동형) */
export const updateStaffRequestSchema = mutationBodySchema.extend({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  dailyWage: z.number().int().nonnegative().nullable().optional(),
  memo: z.string().nullable().optional(),
  active: z.boolean().optional(),
})
export type UpdateStaffRequest = z.infer<typeof updateStaffRequestSchema>

/** DELETE /api/staff/:id — 소프트 비활성(active=false). 응답 okResponse(common) (AC-4) */
export const deleteStaffRequestSchema = mutationBodySchema
export type DeleteStaffRequest = z.infer<typeof deleteStaffRequestSchema>
