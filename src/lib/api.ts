import type { z } from 'zod'
import {
  calcRecipesResponseSchema,
  type CalcRecipesResponse,
  type PutCalcRecipesRequest,
} from '../types/api/calcRecipes'
import {
  colorsListResponseSchema,
  type ColorsListResponse,
  type PutColorsRequest,
} from '../types/api/colors'
import { errorResponseSchema, okResponseSchema, type OkResponse } from '../types/api/common'
import { configResponseSchema, type ConfigResponse } from '../types/api/config'
import {
  historyItemSchema,
  historyListResponseSchema,
  type HistoryItem,
  type HistoryListResponse,
  type RenameHistoryRequest,
} from '../types/api/history'
import {
  fetchLandInfoResponseSchema,
  parcelResponseSchema,
  type FetchLandInfoResponse,
  type ParcelResponse,
} from '../types/api/parcels'
import {
  tabSchema,
  tabsListResponseSchema,
  type CreateTabRequest,
  type Tab,
  type TabsListResponse,
  type UpdateTabRequest,
} from '../types/api/tabs'
import {
  tabStateResponseSchema,
  type ImportTabRequest,
  type ResetTabRequest,
  type TabStateResponse,
  type UpsertGroupRequest,
  type UpsertParcelRequest,
} from '../types/api/tabState'

/** 비 2xx 응답 — 호출부가 status로 분기할 수 있게 보존 (예: 마지막 탭 삭제 409) */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * 모듈 단위 클라이언트 ID — mutate 요청에 자동 주입되고 행의 updated_by에 기록된다.
 * Realtime 에코 가드: 구독 쪽에서 getClientId()와 updated_by를 비교해 자기 변경을 무시한다.
 */
const CLIENT_ID = crypto.randomUUID()

export function getClientId(): string {
  return CLIENT_ID
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function request<T>(
  method: HttpMethod,
  path: string,
  schema: z.ZodType<T>,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(path, {
    method,
    ...(body !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })

  if (!res.ok) {
    let message = `API ${method} ${path} 실패 (${res.status})`
    try {
      const parsed = errorResponseSchema.safeParse(await res.json())
      if (parsed.success) message = parsed.data.error
    } catch {
      // 본문이 JSON이 아니면 기본 메시지 유지
    }
    throw new ApiError(res.status, message)
  }

  return schema.parse(await res.json())
}

/** mutate 전용 — clientId를 자동 주입한다. 호출부는 clientId를 모른다 */
function mutate<T>(
  method: HttpMethod,
  path: string,
  schema: z.ZodType<T>,
  body?: Record<string, unknown>,
): Promise<T> {
  return request(method, path, schema, { ...body, clientId: CLIENT_ID })
}

/** mutate 요청 타입에서 자동 주입되는 clientId를 제거한 호출부 입력 타입 */
type Input<TRequest> = Omit<TRequest, 'clientId'>

export const api = {
  config: {
    get(): Promise<ConfigResponse> {
      return request('GET', '/api/config', configResponseSchema)
    },
  },

  tabs: {
    list(): Promise<TabsListResponse> {
      return request('GET', '/api/tabs', tabsListResponseSchema)
    },
    create(input: Input<CreateTabRequest> = {}): Promise<Tab> {
      return mutate('POST', '/api/tabs', tabSchema, input)
    },
    update(tabId: string, input: Input<UpdateTabRequest>): Promise<Tab> {
      return mutate('PATCH', `/api/tabs/${encodeURIComponent(tabId)}`, tabSchema, input)
    },
    /** 소프트 클로즈 — 마지막 활성 탭이면 ApiError(409) */
    remove(tabId: string): Promise<OkResponse> {
      return mutate('DELETE', `/api/tabs/${encodeURIComponent(tabId)}`, okResponseSchema)
    },
  },

  history: {
    list(): Promise<HistoryListResponse> {
      return request('GET', '/api/history', historyListResponseSchema)
    },
    rename(tabId: string, input: Input<RenameHistoryRequest>): Promise<HistoryItem> {
      return mutate('PATCH', `/api/history/${encodeURIComponent(tabId)}`, historyItemSchema, input)
    },
    restore(tabId: string): Promise<Tab> {
      return mutate('POST', `/api/history/${encodeURIComponent(tabId)}/restore`, tabSchema)
    },
    remove(tabId: string): Promise<OkResponse> {
      return mutate('DELETE', `/api/history/${encodeURIComponent(tabId)}`, okResponseSchema)
    },
  },

  tabState: {
    get(tabId: string): Promise<TabStateResponse> {
      return request('GET', `/api/tabs/${encodeURIComponent(tabId)}/state`, tabStateResponseSchema)
    },
    upsertParcel(
      tabId: string,
      parcelId: string,
      input: Input<UpsertParcelRequest>,
    ): Promise<OkResponse> {
      return mutate(
        'POST',
        `/api/tabs/${encodeURIComponent(tabId)}/parcels/${encodeURIComponent(parcelId)}`,
        okResponseSchema,
        input,
      )
    },
    upsertGroup(tabId: string, input: Input<UpsertGroupRequest>): Promise<OkResponse> {
      return mutate(
        'POST',
        `/api/tabs/${encodeURIComponent(tabId)}/groups`,
        okResponseSchema,
        input,
      )
    },
    reset(tabId: string, input: Input<ResetTabRequest>): Promise<OkResponse> {
      return mutate('POST', `/api/tabs/${encodeURIComponent(tabId)}/reset`, okResponseSchema, input)
    },
    /** import는 예약어라 importState로 명명 */
    importState(tabId: string, input: Input<ImportTabRequest>): Promise<OkResponse> {
      return mutate('PUT', `/api/tabs/${encodeURIComponent(tabId)}/import`, okResponseSchema, input)
    },
  },

  colors: {
    list(): Promise<ColorsListResponse> {
      return request('GET', '/api/colors', colorsListResponseSchema)
    },
    put(input: Input<PutColorsRequest>): Promise<OkResponse> {
      return mutate('PUT', '/api/colors', okResponseSchema, input)
    },
    /** 삭제 + 전 탭 settings/groups의 해당 color 참조 null 처리 (서버 책임) */
    remove(colorId: string): Promise<OkResponse> {
      return mutate('DELETE', `/api/colors/${encodeURIComponent(colorId)}`, okResponseSchema)
    },
  },

  calcRecipes: {
    get(): Promise<CalcRecipesResponse> {
      return request('GET', '/api/calc-recipes', calcRecipesResponseSchema)
    },
    put(input: Input<PutCalcRecipesRequest>): Promise<OkResponse> {
      return mutate('PUT', '/api/calc-recipes', okResponseSchema, input)
    },
  },

  parcels: {
    get(parcelId: string): Promise<ParcelResponse> {
      return request('GET', `/api/parcels/${encodeURIComponent(parcelId)}`, parcelResponseSchema)
    },
    /** Phase 3은 계약만 — 핸들러 구현(M-13) 전까지 ApiError(501) */
    fetchLandInfo(parcelId: string): Promise<FetchLandInfoResponse> {
      return mutate(
        'POST',
        `/api/parcels/${encodeURIComponent(parcelId)}/fetch-land-info`,
        fetchLandInfoResponseSchema,
      )
    },
  },
}
