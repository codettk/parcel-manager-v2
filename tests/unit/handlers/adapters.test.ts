import type { Request, Response } from 'express'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { describe, expect, it } from 'vitest'
import { expressAdapter } from '../../../server/adapters/express'
import { vercelAdapter } from '../../../server/adapters/vercel'
import type { Handler } from '../../../server/handlers/types'

interface CapturedResponse {
  statusCode: number
  body: unknown
}

function mockRes(): CapturedResponse & {
  status: (c: number) => unknown
  json: (b: unknown) => unknown
} {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
  }
  return res
}

async function runExpress(
  handler: Handler,
  req: {
    method: string
    params?: Record<string, string>
    query?: Record<string, string>
    body?: unknown
  },
): Promise<CapturedResponse> {
  const res = mockRes()
  await expressAdapter(handler)(
    {
      method: req.method,
      params: req.params ?? {},
      query: req.query ?? {},
      body: req.body,
    } as unknown as Request,
    res as unknown as Response,
    () => undefined,
  )
  return res
}

async function runVercel(
  handler: Handler,
  req: {
    method: string
    params?: Record<string, string>
    query?: Record<string, string>
    body?: unknown
  },
): Promise<CapturedResponse> {
  const res = mockRes()
  // Vercel rewrite는 경로 파라미터를 query에 실어 보낸다
  const paramNames = Object.keys(req.params ?? {})
  await vercelAdapter(handler, paramNames)(
    {
      method: req.method,
      query: { ...(req.query ?? {}), ...(req.params ?? {}) },
      body: req.body,
    } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  )
  return res
}

describe('어댑터 동등성 (AC-13)', () => {
  it('정상 경로 — 두 런타임에서 status/body가 동일하다', async () => {
    const handler: Handler = async (req) => ({
      status: 200,
      body: { method: req.method, params: req.params, query: req.query, echo: req.body },
    })
    const input = {
      method: 'POST',
      params: { tabId: 'tab_x', id: 'p1' },
      query: { q: '1' },
      body: { clientId: 'c1' },
    }
    const [ex, vc] = await Promise.all([runExpress(handler, input), runVercel(handler, input)])
    expect(ex.statusCode).toBe(200)
    expect(vc.statusCode).toBe(ex.statusCode)
    expect(vc.body).toEqual(ex.body)
    expect(ex.body).toEqual({
      method: 'POST',
      params: { tabId: 'tab_x', id: 'p1' },
      query: { q: '1' },
      echo: { clientId: 'c1' },
    })
  })

  it('핸들러가 정의한 비정상 status(404/409)도 동일하게 전달된다', async () => {
    const handler: Handler = async () => ({ status: 409, body: { error: '마지막 탭' } })
    const input = { method: 'DELETE', params: { id: 'tab_x' } }
    const [ex, vc] = await Promise.all([runExpress(handler, input), runVercel(handler, input)])
    expect(ex.statusCode).toBe(409)
    expect(vc.statusCode).toBe(409)
    expect(vc.body).toEqual(ex.body)
  })

  it('핸들러 throw — 두 런타임 모두 500 + { error }', async () => {
    const handler: Handler = async () => {
      throw new Error('폭발')
    }
    const input = { method: 'GET' }
    const [ex, vc] = await Promise.all([runExpress(handler, input), runVercel(handler, input)])
    expect(ex.statusCode).toBe(500)
    expect(vc.statusCode).toBe(500)
    expect(ex.body).toEqual({ error: '폭발' })
    expect(vc.body).toEqual(ex.body)
  })
})
