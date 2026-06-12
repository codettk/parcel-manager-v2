import { z } from 'zod'
import { mutationBodySchema } from './common'

/** 필지 마스터 (전 탭 공유) — parcels 행의 API 표현. 좌표는 [lng,lat] 배열 */
export const parcelSchema = z.object({
  localId: z.string(),
  pnu: z.string().nullable(),
  jibun: z.string().nullable(),
  jibunFull: z.string().nullable(),
  ldCode: z.string().nullable(),
  ldCodeNm: z.string().nullable(),
  lndcgrCode: z.string().nullable(),
  lndcgrCodeNm: z.string().nullable(),
  lndpclAr: z.number().nullable(),
  posesnSeCode: z.string().nullable(),
  posesnSeCodeNm: z.string().nullable(),
  cnrsPsnCo: z.number().int().nullable(),
  regstrSeCode: z.string().nullable(),
  regstrSeCodeNm: z.string().nullable(),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
  vworldFetchedAt: z.string().nullable(),
})
export type Parcel = z.infer<typeof parcelSchema>

/** GET /api/parcels/:id — 마스터 행 / 404 */
export const parcelResponseSchema = parcelSchema
export type ParcelResponse = z.infer<typeof parcelResponseSchema>

/**
 * GET /api/parcel-areas — 전 필지 공부상 면적(lndpcl_ar) 일괄 조회 (M-9 목록 뷰).
 * 핸들러가 .range() 페이징으로 전량 수집 — supabase-js 기본 1,000행 제한 우회
 */
export const parcelAreasResponseSchema = z.record(z.string(), z.number().nullable())
export type ParcelAreasResponse = z.infer<typeof parcelAreasResponseSchema>

/**
 * POST /api/parcels/:id/fetch-land-info — V-World 토지정보 갱신.
 * Phase 3은 계약만 확정, 구현은 M-13 — 그때까지 핸들러는 501
 */
export const fetchLandInfoRequestSchema = mutationBodySchema
export type FetchLandInfoRequest = z.infer<typeof fetchLandInfoRequestSchema>

export const fetchLandInfoResponseSchema = parcelSchema
export type FetchLandInfoResponse = z.infer<typeof fetchLandInfoResponseSchema>
