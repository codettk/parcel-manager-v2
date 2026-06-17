import { fetchLandInfoRequestSchema } from '../../src/types/api/parcels.js'
import type { Parcel, ParcelAreasResponse } from '../../src/types/api/parcels.js'
import { requireUser } from './auth.js'
import { createDb } from './db.js'
import {
  badGateway,
  badRequest,
  conflict,
  methodNotAllowed,
  notFound,
  serviceUnavailable,
} from './http.js'
import type { Handler } from './types.js'
import { fetchLadfrl } from './vworld.js'

interface ParcelRow {
  local_id: string
  pnu: string | null
  jibun: string | null
  jibun_full: string | null
  ld_code: string | null
  ld_code_nm: string | null
  lndcgr_code: string | null
  lndcgr_code_nm: string | null
  lndpcl_ar: number | null
  posesn_se_code: string | null
  posesn_se_code_nm: string | null
  cnrs_psn_co: number | null
  regstr_se_code: string | null
  regstr_se_code_nm: string | null
  coordinates: [number, number][]
  vworld_fetched_at: string | null
}

function rowToParcel(row: ParcelRow): Parcel {
  return {
    localId: row.local_id,
    pnu: row.pnu,
    jibun: row.jibun,
    jibunFull: row.jibun_full,
    ldCode: row.ld_code,
    ldCodeNm: row.ld_code_nm,
    lndcgrCode: row.lndcgr_code,
    lndcgrCodeNm: row.lndcgr_code_nm,
    lndpclAr: row.lndpcl_ar,
    posesnSeCode: row.posesn_se_code,
    posesnSeCodeNm: row.posesn_se_code_nm,
    cnrsPsnCo: row.cnrs_psn_co,
    regstrSeCode: row.regstr_se_code,
    regstrSeCodeNm: row.regstr_se_code_nm,
    coordinates: row.coordinates,
    vworldFetchedAt: row.vworld_fetched_at,
  }
}

/** GET /api/parcels/:id */
export const parcelItemHandler: Handler = async (req, ctx) => {
  if (req.method !== 'GET') return methodNotAllowed()
  const db = createDb(ctx.env)
  const { data, error } = await db
    .from('parcels')
    .select('*')
    .eq('local_id', req.params.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return notFound('필지를 찾을 수 없습니다')
  return { status: 200, body: rowToParcel(data as ParcelRow) }
}

/** supabase-js 기본 응답 상한(1,000행)과 같은 크기 — 페이지가 가득 차지 않으면 마지막 페이지 */
const AREAS_PAGE_SIZE = 1000

/**
 * GET /api/parcel-areas — 전 필지 공부상 면적(lndpcl_ar) 일괄 조회 (M-9 목록 뷰).
 * supabase-js 기본 1,000행 제한을 .range() 페이징으로 우회해 전량(4,409행)을 한 응답에 모은다
 */
export const parcelAreasHandler: Handler = async (req, ctx) => {
  if (req.method !== 'GET') return methodNotAllowed()
  const db = createDb(ctx.env)
  const areas: ParcelAreasResponse = {}
  for (let from = 0; ; from += AREAS_PAGE_SIZE) {
    const { data, error } = await db
      .from('parcels')
      .select('local_id, lndpcl_ar')
      .order('local_id', { ascending: true })
      .range(from, from + AREAS_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Pick<ParcelRow, 'local_id' | 'lndpcl_ar'>[]
    for (const row of rows) areas[row.local_id] = row.lndpcl_ar
    if (rows.length < AREAS_PAGE_SIZE) break
  }
  return { status: 200, body: areas }
}

const PNU_LENGTH = 19

/**
 * POST /api/parcels/:id/fetch-land-info — V-World 토지임야 정보 조회 후 parcels 행 갱신.
 * 성공 시 갱신된 마스터 행 전체를 parcelSchema(camelCase)로 반환.
 * clientId는 계약 일관성용 — parcels는 updated_by/Realtime 대상이 아니라 에코 가드에 쓰이지 않는다.
 */
export const fetchLandInfoHandler: Handler = async (req, ctx) => {
  if (req.method !== 'POST') return methodNotAllowed()
  const parsed = fetchLandInfoRequestSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(parsed.error)
  const auth = await requireUser(ctx)
  if ('response' in auth) return auth.response

  if (!ctx.env.V_WORLD_LADFRLLIST) {
    return serviceUnavailable('V-World API 키가 설정되지 않았습니다')
  }

  const db = createDb(ctx.env)
  const { data, error } = await db
    .from('parcels')
    .select('*')
    .eq('local_id', req.params.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return notFound('필지를 찾을 수 없습니다')

  const row = data as ParcelRow
  if (!row.pnu || row.pnu.length !== PNU_LENGTH) {
    return conflict('PNU(19자리)가 확보되지 않았습니다')
  }

  const result = await fetchLadfrl(row.pnu, ctx.env)
  if (!result.ok) {
    return badGateway(`V-World 토지정보 조회 실패: ${result.message}`)
  }

  const { data: updated, error: updateError } = await db
    .from('parcels')
    .update(result.mapping)
    .eq('local_id', req.params.id)
    .select('*')
    .single()
  if (updateError) throw new Error(updateError.message)

  return { status: 200, body: rowToParcel(updated as ParcelRow) }
}
