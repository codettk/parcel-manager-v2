import { z } from 'zod'
import { mutationBodySchema } from './common.js'

/** YYYY-MM-DD 작업일 */
const workDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식')
/** 근무율 — 전일 1.0·반일 0.5·연장 >1.0. 0 초과(AC-4) */
const workRatioSchema = z.number().positive()
/** 적용 일당(원) — 음수 거부(AC-4) */
const appliedWageSchema = z.number().int().nonnegative()

/**
 * 업무일지 투입 인력 한 줄 — `work_log_workers` 행의 API 표현.
 * 작성 시점 일당·인력명을 **스냅샷**해 5a 마스터(staff) 변경/비활성에 소급되지 않는다(회계 무결성, 절충 2).
 * `staffId`는 참조로 유지하되 계산·표시는 스냅샷이 권위.
 */
export const workLogWorkerSchema = z.object({
  staffId: z.string(),
  /** 작성 시점 인력명 스냅샷 — 서버가 마스터에서 채운다(클라이언트 위조 불가) */
  staffNameSnapshot: z.string(),
  /** 적용 일당 스냅샷 — 마스터 dailyWage에서 기본채움 후 오버라이드 가능 */
  appliedWage: appliedWageSchema,
  workRatio: workRatioSchema,
})
export type WorkLogWorker = z.infer<typeof workLogWorkerSchema>

/**
 * 업무일지 1건 — `work_logs` 헤더 + 투입 인력 라인. 전역 공유 + createdBy 신원(5a 일관).
 * `totalCost`는 서버 계산 Σ(appliedWage × workRatio)(클라이언트는 cost.ts로 동형 미리보기, 서버 권위).
 */
export const workLogSchema = z.object({
  logId: z.string(),
  workDate: workDateSchema,
  title: z.string().min(1),
  memo: z.string().nullable(),
  workers: z.array(workLogWorkerSchema),
  /** 인건비 합계(원) — 서버 계산 권위 */
  totalCost: z.number().int().nonnegative(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type WorkLog = z.infer<typeof workLogSchema>

/** GET /api/work-logs — 날짜 내림차순. `?from=YYYY-MM-DD&to=YYYY-MM-DD` 기간 필터(AC-6) */
export const workLogListResponseSchema = z.array(workLogSchema)
export type WorkLogListResponse = z.infer<typeof workLogListResponseSchema>

/**
 * 생성/수정 요청의 투입 인력 입력 — `staffNameSnapshot`은 서버가 마스터에서 스냅샷한다(요청 미포함).
 * `appliedWage`는 클라이언트 제공(UI가 마스터 dailyWage로 기본채움 후 사용자 오버라이드).
 */
export const workLogWorkerInputSchema = z.object({
  staffId: z.string(),
  appliedWage: appliedWageSchema,
  workRatio: workRatioSchema,
})
export type WorkLogWorkerInput = z.infer<typeof workLogWorkerInputSchema>

/** POST /api/work-logs — 생성 (requireUser, created_by 자동, 라인 스냅샷·totalCost 서버 계산, AC-5) */
export const createWorkLogRequestSchema = mutationBodySchema.extend({
  workDate: workDateSchema,
  title: z.string().min(1),
  memo: z.string().optional(),
  workers: z.array(workLogWorkerInputSchema),
})
export type CreateWorkLogRequest = z.infer<typeof createWorkLogRequestSchema>

/** PATCH /api/work-logs/:id — 헤더 갱신 + 라인 전체 치환(AC-7) */
export const updateWorkLogRequestSchema = mutationBodySchema.extend({
  workDate: workDateSchema.optional(),
  title: z.string().min(1).optional(),
  memo: z.string().nullable().optional(),
  /** 지정 시 투입 인력 라인 전체 치환(부분 patch 아님 — 스냅샷 재계산) */
  workers: z.array(workLogWorkerInputSchema).optional(),
})
export type UpdateWorkLogRequest = z.infer<typeof updateWorkLogRequestSchema>

/** DELETE /api/work-logs/:id — 하드 삭제(라인 CASCADE). 응답 okResponse(common) (AC-8) */
export const deleteWorkLogRequestSchema = mutationBodySchema
export type DeleteWorkLogRequest = z.infer<typeof deleteWorkLogRequestSchema>
