import type { ZodError } from 'zod'
import type { HandlerResponse } from './types'

export function badRequest(error: ZodError | string): HandlerResponse {
  return {
    status: 400,
    body: { error: typeof error === 'string' ? error : error.message },
  }
}

export function notFound(message: string): HandlerResponse {
  return { status: 404, body: { error: message } }
}

export function conflict(message: string): HandlerResponse {
  return { status: 409, body: { error: message } }
}

export function methodNotAllowed(): HandlerResponse {
  return { status: 405, body: { error: '허용되지 않는 메서드입니다' } }
}

/** 502 — 외부 게이트웨이(V-World 등) 호출·파싱·무자료 실패 */
export function badGateway(message: string): HandlerResponse {
  return { status: 502, body: { error: message } }
}

/** 503 — 서버 구성 미비(필수 환경 변수 미설정 등) */
export function serviceUnavailable(message: string): HandlerResponse {
  return { status: 503, body: { error: message } }
}

export function ok(): HandlerResponse {
  return { status: 200, body: { ok: true } }
}
