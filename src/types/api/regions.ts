import { z } from 'zod'
import { mutationBodySchema } from './common.js'

/**
 * region 카탈로그 항목 — `GET /api/regions` 응답 단위.
 * 전역 공개 카탈로그(인증 불요): 어떤 행정구역이 존재하고 데이터가 적재됐는지.
 * 슬라이스 1의 클라이언트 상수 `regionCatalog.ts`의 `Region`을 서버 권위로 승격한 형태 —
 * 클라이언트는 이 추론 타입과 호환되게 정렬한다(명세 §영향 범위).
 */
export const regionSchema = z.object({
  /** 영속 식별자(localStorage 키·parcels.region_id) — 변경 금지 */
  id: z.string().min(1),
  sido: z.string(),
  sigungu: z.string(),
  emd: z.string(),
  /** 목록·칩 표시명 (예: "인천 강화군 화도면(보구곶)") */
  displayName: z.string(),
  /** 좁은 폭 축약 표시명 (예: "화도면(보구곶)") */
  shortName: z.string(),
  /** 데이터 적재 여부. false면 "준비 중" — 받기 불가(409)·지도 미전환(AC-8·17) */
  loaded: z.boolean(),
  parcelCount: z.number().int().nonnegative(),
  /** 저장 용량 표기 (지역 관리 화면 메타) */
  sizeLabel: z.string(),
  /** 카탈로그 정렬 키(서버 권위 — 적재 region 우선) */
  sortOrder: z.number().int(),
})
export type Region = z.infer<typeof regionSchema>

/** GET /api/regions — 전역 공개 카탈로그 (인증 불요, sortOrder 순, AC-1) */
export const regionsResponseSchema = z.array(regionSchema)
export type RegionsResponse = z.infer<typeof regionsResponseSchema>

/** 사용자가 받은 region 한 건 — `user_regions` 행의 API 표현 */
export const userRegionSchema = z.object({
  regionId: z.string().min(1),
  /** 받은 시각 — ISO 문자열 */
  acquiredAt: z.string(),
})
export type UserRegion = z.infer<typeof userRegionSchema>

/** GET /api/regions/mine — 로그인 사용자의 받은 지역 목록 (requireUser, 기기 독립 영속, AC-11) */
export const userRegionsResponseSchema = z.array(userRegionSchema)
export type UserRegionsResponse = z.infer<typeof userRegionsResponseSchema>

/**
 * POST /api/regions/:id/acquire — 받기 (requireUser).
 * `loaded=false`("준비 중") region이면 409(AC-8). 멱등 — 이미 받았으면 기존 행 반환.
 */
export const regionAcquireRequestSchema = mutationBodySchema
export type RegionAcquireRequest = z.infer<typeof regionAcquireRequestSchema>

/** 받기 성공 응답 — 기록된 받은 항목 (AC-7) */
export const regionAcquireResponseSchema = userRegionSchema
export type RegionAcquireResponse = z.infer<typeof regionAcquireResponseSchema>

/**
 * DELETE /api/regions/:id — 받은 목록에서 제거 (requireUser, `user_regions` 행만 삭제).
 * parcels 마스터·다른 사용자 목록 무영향(AC-9). 응답은 okResponseSchema(common) 재사용.
 * 활성 region 제거 가드(AC-14)는 클라이언트가 1차 강제 — 서버는 행 삭제만 수행.
 */
export const regionRemoveRequestSchema = mutationBodySchema
export type RegionRemoveRequest = z.infer<typeof regionRemoveRequestSchema>
