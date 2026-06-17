import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getClientId, registerAuthTokenProvider } from '../../../src/lib/api'

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

function lastHeaders(): Record<string, string> {
  const call = fetchMock.mock.calls.at(-1)
  if (!call) throw new Error('fetch가 호출되지 않았다')
  const init = call[1] ?? {}
  return (init.headers as Record<string, string> | undefined) ?? {}
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  registerAuthTokenProvider(async () => null) // 기본(비로그인)으로 원복 — 다른 테스트 격리
  vi.unstubAllGlobals()
})

describe('Authorization Bearer 부착 (AC-9·12)', () => {
  it('세션 토큰이 있으면 모든 요청에 Bearer 헤더를 싣는다', async () => {
    registerAuthTokenProvider(async () => 'access-tok-123')
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []))
    await api.tabs.list()
    expect(lastHeaders().Authorization).toBe('Bearer access-tok-123')
  })

  it('mutate 요청에도 Bearer + clientId(에코 가드)가 직교 공존한다 (§결정 3)', async () => {
    registerAuthTokenProvider(async () => 'tok-xyz')
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    await api.tabState.reset('tab_x', { items: ['color'] })
    expect(lastHeaders().Authorization).toBe('Bearer tok-xyz')
    const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body)) as Record<
      string,
      unknown
    >
    expect(body.clientId).toBe(getClientId())
  })

  it('세션 토큰이 없으면 Authorization 헤더를 싣지 않는다', async () => {
    registerAuthTokenProvider(async () => null)
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []))
    await api.tabs.list()
    expect(lastHeaders().Authorization).toBeUndefined()
  })

  it('api.auth.me()는 GET /api/me를 호출하고 meResponseSchema로 parse한다', async () => {
    registerAuthTokenProvider(async () => 'tok')
    const me = {
      userId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      provider: 'kakao',
      displayName: '보구곶',
      avatarUrl: null,
      email: null,
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(200, me))
    await expect(api.auth.me()).resolves.toEqual(me)
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toBe('/api/me')
  })
})
