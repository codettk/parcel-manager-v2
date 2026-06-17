import { meHandler } from './handlers/auth.js'
import { calcRecipesHandler } from './handlers/calcRecipes.js'
import { colorItemHandler, colorsCollectionHandler } from './handlers/colors.js'
import { configHandler } from './handlers/config.js'
import { contactsCollectionHandler, contactsItemHandler } from './handlers/contacts.js'
import { reverseGeocodeHandler } from './handlers/geocode.js'
import {
  historyCollectionHandler,
  historyItemHandler,
  historyRestoreHandler,
} from './handlers/history.js'
import {
  inventoryItemsCollectionHandler,
  inventoryItemsItemHandler,
} from './handlers/inventoryItems.js'
import {
  inventoryTransactionsCollectionHandler,
  inventoryTransactionsItemHandler,
} from './handlers/inventoryTransactions.js'
import { fetchLandInfoHandler, parcelAreasHandler, parcelItemHandler } from './handlers/parcels.js'
import {
  regionAcquireHandler,
  regionRemoveHandler,
  regionsCatalogHandler,
  regionsMineHandler,
} from './handlers/regions.js'
import { staffCollectionHandler, staffItemHandler } from './handlers/staff.js'
import {
  tabGroupsHandler,
  tabImportHandler,
  tabParcelHandler,
  tabResetHandler,
  tabStateHandler,
} from './handlers/tabState.js'
import { tabItemHandler, tabsCollectionHandler } from './handlers/tabs.js'
import type { Handler, HandlerResponse } from './handlers/types.js'
import { workLogItemHandler, workLogsCollectionHandler } from './handlers/workLogs.js'

/**
 * 런타임 비의존 라우팅 테이블 — Express dev-server와 Vercel catch-all(api/[...path].ts)이
 * 단일 진실로 공유한다. pattern의 ':name'은 경로 파라미터.
 * (v1의 server.js ↔ api/ 라우트 분기 재발 방지 + Vercel 함수 17→1 통합으로 Hobby 12개 한도 회피)
 */
export interface Route {
  method: string
  pattern: string
  handler: Handler
}

export const routes: Route[] = [
  { method: 'GET', pattern: '/api/config', handler: configHandler },

  { method: 'GET', pattern: '/api/me', handler: meHandler },

  { method: 'GET', pattern: '/api/tabs', handler: tabsCollectionHandler },
  { method: 'POST', pattern: '/api/tabs', handler: tabsCollectionHandler },
  { method: 'PATCH', pattern: '/api/tabs/:id', handler: tabItemHandler },
  { method: 'DELETE', pattern: '/api/tabs/:id', handler: tabItemHandler },

  { method: 'GET', pattern: '/api/history', handler: historyCollectionHandler },
  { method: 'PATCH', pattern: '/api/history/:id', handler: historyItemHandler },
  { method: 'DELETE', pattern: '/api/history/:id', handler: historyItemHandler },
  { method: 'POST', pattern: '/api/history/:id/restore', handler: historyRestoreHandler },

  { method: 'GET', pattern: '/api/tabs/:tabId/state', handler: tabStateHandler },
  { method: 'POST', pattern: '/api/tabs/:tabId/parcels/:id', handler: tabParcelHandler },
  { method: 'POST', pattern: '/api/tabs/:tabId/groups', handler: tabGroupsHandler },
  { method: 'POST', pattern: '/api/tabs/:tabId/reset', handler: tabResetHandler },
  { method: 'PUT', pattern: '/api/tabs/:tabId/import', handler: tabImportHandler },

  { method: 'GET', pattern: '/api/colors', handler: colorsCollectionHandler },
  { method: 'PUT', pattern: '/api/colors', handler: colorsCollectionHandler },
  { method: 'DELETE', pattern: '/api/colors/:id', handler: colorItemHandler },

  { method: 'GET', pattern: '/api/calc-recipes', handler: calcRecipesHandler },
  { method: 'PUT', pattern: '/api/calc-recipes', handler: calcRecipesHandler },

  // region 카탈로그(공개) + 받기/제거(requireUser). 'mine'(리터럴 3세그)은 :id GET이 없어 충돌 없음.
  { method: 'GET', pattern: '/api/regions', handler: regionsCatalogHandler },
  { method: 'GET', pattern: '/api/regions/mine', handler: regionsMineHandler },
  { method: 'POST', pattern: '/api/regions/:id/acquire', handler: regionAcquireHandler },
  { method: 'DELETE', pattern: '/api/regions/:id', handler: regionRemoveHandler },

  // 좌표 → 행정구역 역지오코딩 프록시(requireUser). 'geocode/reverse'(리터럴 2세그)는 충돌 없음.
  { method: 'POST', pattern: '/api/geocode/reverse', handler: reverseGeocodeHandler },

  { method: 'GET', pattern: '/api/parcel-areas', handler: parcelAreasHandler },
  { method: 'GET', pattern: '/api/parcels/:id', handler: parcelItemHandler },
  { method: 'POST', pattern: '/api/parcels/:id/fetch-land-info', handler: fetchLandInfoHandler },

  // 영농 ERP 인력·거래처 마스터(전역 공유, requireUser). 컬렉션 2세그 vs 아이템 3세그로 충돌 없음.
  { method: 'GET', pattern: '/api/staff', handler: staffCollectionHandler },
  { method: 'POST', pattern: '/api/staff', handler: staffCollectionHandler },
  { method: 'PATCH', pattern: '/api/staff/:id', handler: staffItemHandler },
  { method: 'DELETE', pattern: '/api/staff/:id', handler: staffItemHandler },

  { method: 'GET', pattern: '/api/contacts', handler: contactsCollectionHandler },
  { method: 'POST', pattern: '/api/contacts', handler: contactsCollectionHandler },
  { method: 'PATCH', pattern: '/api/contacts/:id', handler: contactsItemHandler },
  { method: 'DELETE', pattern: '/api/contacts/:id', handler: contactsItemHandler },

  // 영농 ERP 업무일지(전역 공유, requireUser). 컬렉션 2세그 vs 아이템 3세그로 충돌 없음.
  { method: 'GET', pattern: '/api/work-logs', handler: workLogsCollectionHandler },
  { method: 'POST', pattern: '/api/work-logs', handler: workLogsCollectionHandler },
  { method: 'PATCH', pattern: '/api/work-logs/:id', handler: workLogItemHandler },
  { method: 'DELETE', pattern: '/api/work-logs/:id', handler: workLogItemHandler },

  // 영농 ERP 재고(전역 공유, mutate requireUser). 중첩 4세그 경로 — 컬렉션 3세그(/api/inventory/items) vs
  // 아이템 4세그(/api/inventory/items/:id)로 matchRoute가 세그먼트 수로 구분(d1b3d6f 중첩 패턴, 충돌 없음).
  { method: 'GET', pattern: '/api/inventory/items', handler: inventoryItemsCollectionHandler },
  { method: 'POST', pattern: '/api/inventory/items', handler: inventoryItemsCollectionHandler },
  { method: 'PATCH', pattern: '/api/inventory/items/:id', handler: inventoryItemsItemHandler },
  { method: 'DELETE', pattern: '/api/inventory/items/:id', handler: inventoryItemsItemHandler },

  {
    method: 'GET',
    pattern: '/api/inventory/transactions',
    handler: inventoryTransactionsCollectionHandler,
  },
  {
    method: 'POST',
    pattern: '/api/inventory/transactions',
    handler: inventoryTransactionsCollectionHandler,
  },
  {
    method: 'DELETE',
    pattern: '/api/inventory/transactions/:id',
    handler: inventoryTransactionsItemHandler,
  },
]

/**
 * method + pathname을 라우팅 테이블에 매칭. 패턴은 메서드·세그먼트 수·리터럴로 유일하게 구분되어
 * 그리디 충돌이 없다(:id 2세그먼트 vs :tabId/state 3세그먼트 등). 매칭 시 경로 파라미터를 디코드해 반환.
 */
export function matchRoute(
  method: string,
  pathname: string,
): { handler: Handler; params: Record<string, string> } | null {
  const segs = pathname.split('/').filter(Boolean)
  for (const route of routes) {
    if (route.method !== method) continue
    const pat = route.pattern.split('/').filter(Boolean)
    if (pat.length !== segs.length) continue
    const params: Record<string, string> = {}
    let matched = true
    for (let i = 0; i < pat.length; i++) {
      const token = pat[i]
      if (token.startsWith(':')) {
        params[token.slice(1)] = decodeURIComponent(segs[i])
      } else if (token !== segs[i]) {
        matched = false
        break
      }
    }
    if (matched) return { handler: route.handler, params }
  }
  return null
}

/** Authorization 헤더(대소문자 무관)에서 Bearer 토큰을 추출 — 없으면 null */
export function extractBearerToken(authorization: string | undefined | null): string | null {
  if (!authorization) return null
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim())
  return match ? match[1].trim() : null
}

/**
 * 런타임 비의존 디스패치 — Vercel catch-all과 테스트가 공유한다.
 * 매칭 실패 404, 핸들러 throw 500(express 어댑터와 동형). url은 '/api/...?q=1' 전체 경로.
 * authorization: Authorization 헤더 원문(있을 때만) — 핸들러 ctx.auth.token으로 전달(세션 신원).
 */
export async function dispatch(
  method: string,
  url: string,
  body: unknown,
  env: Record<string, string | undefined>,
  authorization?: string | null,
): Promise<HandlerResponse> {
  const parsed = new URL(url, 'http://localhost')
  const match = matchRoute(method, parsed.pathname)
  if (!match) {
    return { status: 404, body: { error: `경로를 찾을 수 없습니다: ${method} ${parsed.pathname}` } }
  }
  const query: Record<string, string | undefined> = {}
  for (const [key, value] of parsed.searchParams.entries()) query[key] = value
  try {
    return await match.handler(
      { method, params: match.params, query, body },
      { env, auth: { token: extractBearerToken(authorization) } },
    )
  } catch (e) {
    return { status: 500, body: { error: e instanceof Error ? e.message : String(e) } }
  }
}
