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
import { meResponseSchema, type MeResponse } from '../types/api/auth'
import { errorResponseSchema, okResponseSchema, type OkResponse } from '../types/api/common'
import { configResponseSchema, type ConfigResponse } from '../types/api/config'
import {
  reverseGeocodeResponseSchema,
  type ReverseGeocodeRequest,
  type ReverseGeocodeResponse,
} from '../types/api/geocode'
import {
  contactSchema,
  contactListResponseSchema,
  type Contact,
  type ContactListResponse,
  type CreateContactRequest,
  type UpdateContactRequest,
} from '../types/api/contacts'
import {
  staffSchema,
  staffListResponseSchema,
  type CreateStaffRequest,
  type Staff,
  type StaffListResponse,
  type UpdateStaffRequest,
} from '../types/api/staff'
import {
  workLogSchema,
  workLogListResponseSchema,
  type CreateWorkLogRequest,
  type UpdateWorkLogRequest,
  type WorkLog,
  type WorkLogListResponse,
} from '../types/api/workLogs'
import {
  historyItemSchema,
  historyListResponseSchema,
  type HistoryItem,
  type HistoryListResponse,
  type RenameHistoryRequest,
} from '../types/api/history'
import {
  fetchLandInfoResponseSchema,
  parcelAreasResponseSchema,
  parcelResponseSchema,
  type FetchLandInfoResponse,
  type ParcelAreasResponse,
  type ParcelResponse,
} from '../types/api/parcels'
import {
  regionAcquireResponseSchema,
  regionsResponseSchema,
  userRegionsResponseSchema,
  type RegionAcquireResponse,
  type RegionsResponse,
  type UserRegionsResponse,
} from '../types/api/regions'
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

/**
 * 인증 토큰 제공자 — 모든 요청의 Authorization: Bearer 헤더에 쓰인다 (AC-9·12).
 * 의존 역전: api.ts는 auth.ts를 import하지 않고(순환 회피) 부팅 시 registerAuthTokenProvider로 주입받는다.
 * 토큰=신원, clientId=에코 가드 — 직교 보존 (§결정 3): 토큰을 헤더에, clientId는 본문에 그대로 둔다.
 */
let getAuthToken: () => Promise<string | null> = async () => null

export function registerAuthTokenProvider(provider: () => Promise<string | null>): void {
  getAuthToken = provider
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function request<T>(
  method: HttpMethod,
  path: string,
  schema: z.ZodType<T>,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = await getAuthToken()
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token !== null) headers.Authorization = `Bearer ${token}`
  const res = await fetch(path, {
    method,
    ...(Object.keys(headers).length > 0 && { headers }),
    ...(body !== undefined && { body: JSON.stringify(body) }),
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

  auth: {
    /** GET /api/me — 현재 세션 신원. 무/만료 토큰이면 ApiError(401) (errorResponseSchema) */
    me(): Promise<MeResponse> {
      return request('GET', '/api/me', meResponseSchema)
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

  regions: {
    /** GET /api/regions — 전역 공개 카탈로그 (인증 불요, sortOrder 순, AC-1·2) */
    list(): Promise<RegionsResponse> {
      return request('GET', '/api/regions', regionsResponseSchema)
    },
    /** GET /api/regions/mine — 로그인 사용자의 받은 지역 목록 (requireUser, 기기 독립 영속, AC-11) */
    mine(): Promise<UserRegionsResponse> {
      return request('GET', '/api/regions/mine', userRegionsResponseSchema)
    },
    /** POST /api/regions/:id/acquire — 받기 (requireUser). loaded=false면 ApiError(409) (AC-7·8) */
    acquire(regionId: string): Promise<RegionAcquireResponse> {
      return mutate(
        'POST',
        `/api/regions/${encodeURIComponent(regionId)}/acquire`,
        regionAcquireResponseSchema,
      )
    },
    /** DELETE /api/regions/:id — 받은 목록에서 제거 (requireUser, user_regions 행만 삭제, AC-9) */
    remove(regionId: string): Promise<OkResponse> {
      return mutate('DELETE', `/api/regions/${encodeURIComponent(regionId)}`, okResponseSchema)
    },
  },

  geocode: {
    /**
     * POST /api/geocode/reverse — 좌표 → 행정구역 (requireUser, Authorization 자동 주입).
     * mutate(행 기록)가 아니므로 clientId는 보내지 않는다 — request 경로 사용.
     * 키 부재 503·외부 실패 502·무세션 401은 ApiError로 던져 호출부(useGpsLocate)가 status로 분기한다.
     */
    reverse(coords: ReverseGeocodeRequest): Promise<ReverseGeocodeResponse> {
      return request('POST', '/api/geocode/reverse', reverseGeocodeResponseSchema, coords)
    },
  },

  staff: {
    /** GET /api/staff — 기본 활성만, includeInactive=true면 비활성 포함 (AC-2·12) */
    list(includeInactive = false): Promise<StaffListResponse> {
      const path = includeInactive ? '/api/staff?includeInactive=true' : '/api/staff'
      return request('GET', path, staffListResponseSchema)
    },
    /** POST /api/staff — 생성 (requireUser·active=true·created_by 자동, AC-1) */
    create(input: Input<CreateStaffRequest>): Promise<Staff> {
      return mutate('POST', '/api/staff', staffSchema, input)
    },
    /** PATCH /api/staff/:id — 부분 수정 + 재활성화(active=true) (AC-3·9 동형) */
    update(staffId: string, input: Input<UpdateStaffRequest>): Promise<Staff> {
      return mutate('PATCH', `/api/staff/${encodeURIComponent(staffId)}`, staffSchema, input)
    },
    /** DELETE /api/staff/:id — 소프트 비활성(active=false) (AC-4) */
    remove(staffId: string): Promise<OkResponse> {
      return mutate('DELETE', `/api/staff/${encodeURIComponent(staffId)}`, okResponseSchema)
    },
  },

  contacts: {
    /** GET /api/contacts — 기본 활성만, includeInactive=true면 비활성 포함 (AC-8) */
    list(includeInactive = false): Promise<ContactListResponse> {
      const path = includeInactive ? '/api/contacts?includeInactive=true' : '/api/contacts'
      return request('GET', path, contactListResponseSchema)
    },
    /** POST /api/contacts — 생성 (requireUser·active=true·created_by 자동, AC-6). 잘못된 kind는 400(AC-7) */
    create(input: Input<CreateContactRequest>): Promise<Contact> {
      return mutate('POST', '/api/contacts', contactSchema, input)
    },
    /** PATCH /api/contacts/:id — 부분 수정 + 재활성화(active=true) (AC-9) */
    update(contactId: string, input: Input<UpdateContactRequest>): Promise<Contact> {
      return mutate('PATCH', `/api/contacts/${encodeURIComponent(contactId)}`, contactSchema, input)
    },
    /** DELETE /api/contacts/:id — 소프트 비활성(active=false) */
    remove(contactId: string): Promise<OkResponse> {
      return mutate('DELETE', `/api/contacts/${encodeURIComponent(contactId)}`, okResponseSchema)
    },
  },

  workLogs: {
    /**
     * GET /api/work-logs — work_date 내림차순. `?from&to`(YYYY-MM-DD) 기간 필터 (AC-6·13).
     * 둘 다 선택 — 미지정이면 전체 반환. requireUser지만 전역 공유라 누구나 같은 목록을 본다(AC-12).
     */
    list(range?: { from?: string; to?: string }): Promise<WorkLogListResponse> {
      const params = new URLSearchParams()
      if (range?.from !== undefined) params.set('from', range.from)
      if (range?.to !== undefined) params.set('to', range.to)
      const qs = params.toString()
      return request(
        'GET',
        qs === '' ? '/api/work-logs' : `/api/work-logs?${qs}`,
        workLogListResponseSchema,
      )
    },
    /** POST /api/work-logs — 생성 (requireUser·created_by 자동, 라인 스냅샷·totalCost 서버 계산, AC-5) */
    create(input: Input<CreateWorkLogRequest>): Promise<WorkLog> {
      return mutate('POST', '/api/work-logs', workLogSchema, input)
    },
    /** PATCH /api/work-logs/:id — 헤더 갱신 + 라인 전체 치환(부분 patch 아님, AC-7) */
    update(logId: string, input: Input<UpdateWorkLogRequest>): Promise<WorkLog> {
      return mutate('PATCH', `/api/work-logs/${encodeURIComponent(logId)}`, workLogSchema, input)
    },
    /** DELETE /api/work-logs/:id — 하드 삭제(라인 CASCADE) (AC-8·15) */
    remove(logId: string): Promise<OkResponse> {
      return mutate('DELETE', `/api/work-logs/${encodeURIComponent(logId)}`, okResponseSchema)
    },
  },

  parcels: {
    get(parcelId: string): Promise<ParcelResponse> {
      return request('GET', `/api/parcels/${encodeURIComponent(parcelId)}`, parcelResponseSchema)
    },
    /** 전 필지 공부상 면적 일괄 조회 (M-9 목록 뷰) — 페이징은 핸들러 소관, 클라이언트는 1회 호출 */
    listAreas(): Promise<ParcelAreasResponse> {
      return request('GET', '/api/parcel-areas', parcelAreasResponseSchema)
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
