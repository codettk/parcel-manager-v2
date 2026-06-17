import { describe, expect, it } from 'vitest'
import { meHandler } from '../../../server/handlers/auth'
import { calcRecipesHandler } from '../../../server/handlers/calcRecipes'
import { colorItemHandler, colorsCollectionHandler } from '../../../server/handlers/colors'
import {
  historyItemHandler,
  historyRestoreHandler,
} from '../../../server/handlers/history'
import { fetchLandInfoHandler } from '../../../server/handlers/parcels'
import {
  tabGroupsHandler,
  tabImportHandler,
  tabParcelHandler,
  tabResetHandler,
} from '../../../server/handlers/tabState'
import { tabItemHandler, tabsCollectionHandler } from '../../../server/handlers/tabs'
import { extractBearerToken } from '../../../server/routes'
import { errorResponseSchema } from '../../../src/types/api/common'
import type { Handler, HandlerContext, HandlerRequest } from '../../../server/handlers/types'

// 토큰 없이(무인증) mutate 핸들러 호출 시 401 + 행 미기록 (AC-12).
// 검증은 schema parse 다음, DB 접근(createDb) 전에 일어나므로 빈 env로도 401 경로를 단위 검증할 수 있다.
const ctxNoAuth: HandlerContext = { env: {} }

describe('extractBearerToken — Authorization 헤더 파싱', () => {
  it('Bearer 토큰을 추출한다(대소문자·공백 무관)', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(extractBearerToken('bearer  xyz ')).toBe('xyz')
  })

  it('헤더 없음/형식 불일치는 null', () => {
    expect(extractBearerToken(undefined)).toBeNull()
    expect(extractBearerToken(null)).toBeNull()
    expect(extractBearerToken('Basic foo')).toBeNull()
    expect(extractBearerToken('abc')).toBeNull()
  })
})

describe('GET /api/me — 무인증이면 401 errorResponseSchema (AC-12)', () => {
  it('토큰 없음 → 401', async () => {
    const res = await meHandler({ method: 'GET', params: {}, query: {}, body: undefined }, ctxNoAuth)
    expect(res.status).toBe(401)
    errorResponseSchema.parse(res.body)
  })

  it('GET 외 메서드 → 405', async () => {
    const res = await meHandler(
      { method: 'POST', params: {}, query: {}, body: undefined },
      ctxNoAuth,
    )
    expect(res.status).toBe(405)
  })
})

// 각 mutate 핸들러: 유효 바디(clientId 포함)라도 인증 토큰이 없으면 401 (행 미기록).
// 토큰 검증이 createDb보다 먼저이므로 빈 env(=DB 미구성)에서도 401이 떠야 한다(throw/500 아님).
const cid = 'c-auth-test'
const mutateCases: { name: string; handler: Handler; req: HandlerRequest }[] = [
  {
    name: 'POST /api/tabs',
    handler: tabsCollectionHandler,
    req: { method: 'POST', params: {}, query: {}, body: { name: '탭', clientId: cid } },
  },
  {
    name: 'PATCH /api/tabs/:id',
    handler: tabItemHandler,
    req: { method: 'PATCH', params: { id: 't' }, query: {}, body: { name: '이름', clientId: cid } },
  },
  {
    name: 'DELETE /api/tabs/:id',
    handler: tabItemHandler,
    req: { method: 'DELETE', params: { id: 't' }, query: {}, body: { clientId: cid } },
  },
  {
    name: 'POST /api/tabs/:tabId/parcels/:id',
    handler: tabParcelHandler,
    req: {
      method: 'POST',
      params: { tabId: 't', id: 'p' },
      query: {},
      body: { color: 'eco', clientId: cid },
    },
  },
  {
    name: 'POST /api/tabs/:tabId/groups',
    handler: tabGroupsHandler,
    req: {
      method: 'POST',
      params: { tabId: 't' },
      query: {},
      body: {
        groupId: 'grp_x',
        group: { name: 'g', memo: null, color: null, style: 'fill', parcelIds: [] },
        clientId: cid,
      },
    },
  },
  {
    name: 'POST /api/tabs/:tabId/reset',
    handler: tabResetHandler,
    req: { method: 'POST', params: { tabId: 't' }, query: {}, body: { items: ['color'], clientId: cid } },
  },
  {
    name: 'PUT /api/tabs/:tabId/import',
    handler: tabImportHandler,
    req: {
      method: 'PUT',
      params: { tabId: 't' },
      query: {},
      body: { overrides: {}, groups: {}, clientId: cid },
    },
  },
  {
    name: 'PUT /api/colors',
    handler: colorsCollectionHandler,
    req: { method: 'PUT', params: {}, query: {}, body: { colors: [], clientId: cid } },
  },
  {
    name: 'DELETE /api/colors/:id',
    handler: colorItemHandler,
    req: { method: 'DELETE', params: { id: 'c1' }, query: {}, body: { clientId: cid } },
  },
  {
    name: 'PATCH /api/history/:id',
    handler: historyItemHandler,
    req: { method: 'PATCH', params: { id: 't' }, query: {}, body: { name: '이름', clientId: cid } },
  },
  {
    name: 'POST /api/history/:id/restore',
    handler: historyRestoreHandler,
    req: { method: 'POST', params: { id: 't' }, query: {}, body: { clientId: cid } },
  },
  {
    name: 'PUT /api/calc-recipes',
    handler: calcRecipesHandler,
    req: { method: 'PUT', params: {}, query: {}, body: { recipes: [], clientId: cid } },
  },
  {
    name: 'POST /api/parcels/:id/fetch-land-info',
    handler: fetchLandInfoHandler,
    req: { method: 'POST', params: { id: 'p' }, query: {}, body: { clientId: cid } },
  },
]

describe('mutate 핸들러 — 무인증(토큰 없음) 시 401, 행 미기록 (AC-12)', () => {
  for (const { name, handler, req } of mutateCases) {
    it(`${name} → 401`, async () => {
      const res = await handler(req, ctxNoAuth)
      expect(res.status).toBe(401)
      errorResponseSchema.parse(res.body)
    })
  }
})
