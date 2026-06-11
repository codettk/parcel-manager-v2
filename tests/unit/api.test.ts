import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, getClientId } from '../../src/lib/api'
import type { Tab } from '../../src/types/api/tabs'

const TAB_FIXTURE: Tab = {
  tabId: 'tab_abc1de2f',
  name: '기본 작업공간',
  sortOrder: 0,
  closedAt: null,
  createdAt: '2026-06-11T00:00:00.000Z',
  updatedBy: null,
  updatedAt: '2026-06-11T00:00:00.000Z',
}

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)
  if (!call) throw new Error('fetch가 호출되지 않았다')
  return { url: String(call[0]), init: call[1] ?? {} }
}

function lastBody(): Record<string, unknown> {
  const { init } = lastCall()
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('clientId 자동 주입', () => {
  it('getClientId()는 모듈 단위로 고정된 ID를 반환한다', () => {
    expect(getClientId()).toBeTruthy()
    expect(getClientId()).toBe(getClientId())
  })

  it('mutate 함수는 호출부가 모르는 clientId를 body에 주입한다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, TAB_FIXTURE))
    await api.tabs.create({ name: '새 탭' })

    const { url, init } = lastCall()
    expect(url).toBe('/api/tabs')
    expect(init.method).toBe('POST')
    expect(lastBody()).toEqual({ name: '새 탭', clientId: getClientId() })
  })

  it('body 없는 mutate(DELETE)에도 clientId만 담아 보낸다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    await api.tabs.remove('tab_x')

    const { url, init } = lastCall()
    expect(url).toBe('/api/tabs/tab_x')
    expect(init.method).toBe('DELETE')
    expect(lastBody()).toEqual({ clientId: getClientId() })
  })

  it('중첩 경로 mutate(reset)에도 입력과 clientId를 합쳐 보낸다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    await api.tabState.reset('tab_x', { items: ['color', 'group'] })

    const { url } = lastCall()
    expect(url).toBe('/api/tabs/tab_x/reset')
    expect(lastBody()).toEqual({ items: ['color', 'group'], clientId: getClientId() })
  })

  it('GET 함수는 body를 보내지 않는다 (clientId 미주입)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []))
    await api.tabs.list()

    const { init } = lastCall()
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
  })
})

describe('응답 zod parse', () => {
  it('스키마에 맞는 응답은 z.infer 타입으로 반환한다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [TAB_FIXTURE]))
    const tabs = await api.tabs.list()
    expect(tabs).toEqual([TAB_FIXTURE])
  })

  it('스키마에 어긋난 응답은 throw한다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [{ tabId: 'tab_x' }]))
    await expect(api.tabs.list()).rejects.toThrow()
  })

  it('tabState.get은 overrides/groups 레코드를 parse한다', async () => {
    const state = {
      overrides: {
        p1: { color: 'eco', style: 'fill', name: null, memo: null, pinned: false, icon: null },
      },
      groups: {
        grp_1: { name: '그룹', memo: null, color: null, style: 'fill', parcelIds: ['p1'] },
      },
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(200, state))
    await expect(api.tabState.get('tab_x')).resolves.toEqual(state)
  })
})

describe('비 2xx → ApiError', () => {
  it('errorResponseSchema 본문이면 그 메시지와 status를 보존한다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: '마지막 활성 탭은 닫을 수 없다' }))

    await api.tabs.remove('tab_last').catch((err: unknown) => {
      const apiError = err as ApiError
      expect(apiError).toBeInstanceOf(ApiError)
      expect(apiError.status).toBe(409)
      expect(apiError.message).toBe('마지막 활성 탭은 닫을 수 없다')
    })
    expect.assertions(3)
  })

  it('JSON이 아닌 에러 본문도 status를 보존한 기본 메시지로 throw한다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))

    await api.tabs.list().catch((err: unknown) => {
      const apiError = err as ApiError
      expect(apiError).toBeInstanceOf(ApiError)
      expect(apiError.status).toBe(500)
      expect(apiError.message).toContain('500')
    })
    expect.assertions(3)
  })

  it('미구현 스텁(501)도 호출부가 status로 분기할 수 있다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(501, { error: 'M-13에서 구현 예정' }))

    await api.parcels.fetchLandInfo('p1').catch((err: unknown) => {
      expect((err as ApiError).status).toBe(501)
    })
    expect.assertions(1)
  })
})
