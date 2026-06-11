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

export function ok(): HandlerResponse {
  return { status: 200, body: { ok: true } }
}
