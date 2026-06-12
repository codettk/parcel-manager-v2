import { fetchLandInfoRequestSchema } from '../../src/types/api/parcels'
import type { Parcel, ParcelAreasResponse } from '../../src/types/api/parcels'
import { createDb } from './db'
import { badRequest, methodNotAllowed, notFound } from './http'
import type { Handler } from './types'

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

/** POST /api/parcels/:id/fetch-land-info — 계약만 Phase 3에서 확정, 구현은 M-13 */
export const fetchLandInfoHandler: Handler = async (req) => {
  if (req.method !== 'POST') return methodNotAllowed()
  const parsed = fetchLandInfoRequestSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(parsed.error)
  return { status: 501, body: { error: 'V-World 토지정보 연동은 M-13에서 구현됩니다' } }
}
