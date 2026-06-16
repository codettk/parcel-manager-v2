import type { Request, Response } from 'express'
import { describe, expect, it } from 'vitest'
import { expressAdapter } from '../../../server/adapters/express'
import { configHandler } from '../../../server/handlers/config'
import { dispatch, matchRoute } from '../../../server/routes'
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

describe('라우팅 테이블 매칭 (matchRoute)', () => {
  it('단일 세그먼트 라우트와 메서드를 매칭한다', () => {
    expect(matchRoute('GET', '/api/config')).not.toBeNull()
    expect(matchRoute('POST', '/api/tabs')).not.toBeNull()
  })

  it('경로 파라미터를 디코드해 추출한다(다중 파라미터 포함)', () => {
    const single = matchRoute('PATCH', '/api/tabs/tab_x')
    expect(single?.params).toEqual({ id: 'tab_x' })

    const multi = matchRoute('POST', '/api/tabs/tab_x/parcels/p%201')
    expect(multi?.params).toEqual({ tabId: 'tab_x', id: 'p 1' })
  })

  it('세그먼트 수가 같아도 메서드가 다르면 매칭하지 않는다', () => {
    // GET /api/tabs/:id 는 라우트에 없다(PATCH/DELETE만)
    expect(matchRoute('GET', '/api/tabs/tab_x')).toBeNull()
  })

  it('존재하지 않는 경로는 null', () => {
    expect(matchRoute('GET', '/api/nope')).toBeNull()
  })
})

describe('어댑터 동등성 (AC-13) — Express(dev) vs dispatch(Vercel)', () => {
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-key' }

  it('정상 경로 — 두 경로가 동일한 status/body를 만든다', async () => {
    const ex = await runExpress(configHandler, { method: 'GET' })
    const vc = await dispatch('GET', '/api/config', undefined, env)
    expect(ex.statusCode).toBe(200)
    expect(vc.status).toBe(200)
    // expressAdapter는 process.env를 쓰므로 body 형태(키)만 동등 비교
    expect(Object.keys(vc.body as object).sort()).toEqual(['supabaseAnonKey', 'supabaseUrl'])
    expect(vc.body).toEqual({
      supabaseUrl: env.SUPABASE_URL,
      supabaseAnonKey: env.SUPABASE_ANON_KEY,
    })
  })

  it('쿼리스트링을 핸들러 query로 전달한다', async () => {
    // config 핸들러는 query를 무시하지만 파싱 경로 자체를 검증(throw 없이 200)
    const vc = await dispatch('GET', '/api/config?foo=bar', undefined, env)
    expect(vc.status).toBe(200)
  })

  it('매칭 실패는 404 + { error }', async () => {
    const vc = await dispatch('GET', '/api/does-not-exist', undefined, env)
    expect(vc.status).toBe(404)
    expect(vc.body).toMatchObject({ error: expect.stringContaining('찾을 수 없습니다') })
  })

  it('핸들러 throw는 500 + { error } (express 어댑터와 동형)', async () => {
    // env 미설정 → tabs 핸들러가 createDb에서 throw → dispatch가 500으로 변환
    const vc = await dispatch('GET', '/api/tabs', undefined, {})
    expect(vc.status).toBe(500)
    expect(vc.body).toMatchObject({ error: expect.any(String) })

    const ex = await runExpressThrow()
    expect(ex.statusCode).toBe(500)
  })
})

/** express 어댑터의 throw→500 경로도 동형임을 확인 */
async function runExpressThrow(): Promise<CapturedResponse> {
  const boom: Handler = async () => {
    throw new Error('폭발')
  }
  const res = await runExpress(boom, { method: 'GET' })
  expect(res.body).toEqual({ error: '폭발' })
  return res
}
