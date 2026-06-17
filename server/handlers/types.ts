/** 런타임(Express/Vercel) 비의존 핸들러 계약 — 어댑터가 양쪽 런타임을 이 형태로 변환한다 */
export interface HandlerRequest {
  method: string
  params: Record<string, string>
  query: Record<string, string | undefined>
  body?: unknown
}

export interface HandlerContext {
  env: Record<string, string | undefined>
  /**
   * 세션 신원 — 어댑터가 Authorization 헤더에서 추출한 Bearer 토큰(있을 때만).
   * 핸들러는 req/res가 아닌 이 필드로만 인증 토큰에 접근한다(런타임 비의존 유지).
   * clientId(에코 가드, body)와 직교하는 신원 채널.
   */
  auth?: { token: string | null }
}

export interface HandlerResponse {
  status: number
  body: unknown
}

export type Handler = (req: HandlerRequest, ctx: HandlerContext) => Promise<HandlerResponse>
