/** 런타임(Express/Vercel) 비의존 핸들러 계약 — 어댑터가 양쪽 런타임을 이 형태로 변환한다 */
export interface HandlerRequest {
  method: string
  params: Record<string, string>
  query: Record<string, string | undefined>
  body?: unknown
}

export interface HandlerContext {
  env: Record<string, string | undefined>
}

export interface HandlerResponse {
  status: number
  body: unknown
}

export type Handler = (req: HandlerRequest, ctx: HandlerContext) => Promise<HandlerResponse>
