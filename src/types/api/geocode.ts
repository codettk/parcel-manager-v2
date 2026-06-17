import { z } from 'zod'

/**
 * POST /api/geocode/reverse — 좌표 → 행정구역 역지오코딩 프록시 (requireUser).
 * 좌표는 외부(V-World) 호출 파라미터로만 사용하고 응답·로그·DB에 기록하지 않는다(명세 절충 4).
 * GET이 아니라 POST인 이유: 좌표를 URL/액세스 로그에 남기지 않기 위함(좌표 비저장 원칙).
 * mutate(행 기록)가 아니므로 `clientId`(에코 가드)는 받지 않는다.
 */
export const reverseGeocodeRequestSchema = z.object({
  /** 경도 (WGS84) */
  lng: z.number().gte(-180).lte(180),
  /** 위도 (WGS84) */
  lat: z.number().gte(-90).lte(90),
})
export type ReverseGeocodeRequest = z.infer<typeof reverseGeocodeRequestSchema>

/** 역지오코딩이 확정한 행정구역 — region 카탈로그(sido·sigungu·emd) 매칭 입력 */
export const adminAreaSchema = z.object({
  sido: z.string().min(1),
  sigungu: z.string().min(1),
  emd: z.string().min(1),
})
export type AdminArea = z.infer<typeof adminAreaSchema>

/**
 * 역지오코딩 성공 응답 (200).
 * `area=null`이면 좌표는 유효하나 행정구역 미확정(AC-5) — 클라이언트는 검색 폴백으로 수렴.
 * 키 부재는 503, 외부 실패는 502(errorResponseSchema), 무세션은 401 — 본 스키마 미반환.
 */
export const reverseGeocodeResponseSchema = z.object({
  area: adminAreaSchema.nullable(),
})
export type ReverseGeocodeResponse = z.infer<typeof reverseGeocodeResponseSchema>
