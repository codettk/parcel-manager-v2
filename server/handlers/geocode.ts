import type { ReverseGeocodeResponse } from '../../src/types/api/geocode.js'
import { reverseGeocodeRequestSchema } from '../../src/types/api/geocode.js'
import { requireUser } from './auth.js'
import { badGateway, badRequest, methodNotAllowed, serviceUnavailable } from './http.js'
import type { Handler } from './types.js'
import { fetchReverseGeocode } from './vworldGeocode.js'

/**
 * POST /api/geocode/reverse — 좌표 → 행정구역 역지오코딩 프록시 (requireUser).
 *
 * 순서가 동작 보존의 핵심:
 *  1) requireUser 401 — 외부 호출 이전(AC-4: 무세션이면 V-World 미호출).
 *  2) body 검증(reverseGeocodeRequestSchema) — 좌표 범위.
 *  3) V_WORLD_GEOCODER 키 부재면 503 — 본문에 좌표 미포함(AC-1, 앱은 검색 폴백 수렴).
 *  4) fetchReverseGeocode — 외부/파싱 실패면 502(AC-3), 성공이면 200.
 *
 * 좌표는 외부 호출 파라미터로만 쓰고 응답·로그·에러 메시지에 남기지 않는다(절충 4).
 * 행정구역 미확정이면 200 `{area:null}`(AC-5) — 좌표·요청 식별자 비에코.
 */
export const reverseGeocodeHandler: Handler = async (req, ctx) => {
  if (req.method !== 'POST') return methodNotAllowed()

  const auth = await requireUser(ctx)
  if ('response' in auth) return auth.response

  const parsed = reverseGeocodeRequestSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(parsed.error)

  if (!ctx.env.V_WORLD_GEOCODER) {
    return serviceUnavailable('역지오코딩 키가 설정되지 않았습니다')
  }

  const result = await fetchReverseGeocode(parsed.data.lng, parsed.data.lat, ctx.env)
  if (!result.ok) {
    return badGateway('역지오코딩 외부 호출에 실패했습니다')
  }

  const body: ReverseGeocodeResponse = { area: result.area }
  return { status: 200, body }
}
