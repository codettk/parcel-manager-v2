import { regionAcquireRequestSchema, regionRemoveRequestSchema } from '../../src/types/api/regions.js'
import type { Region, UserRegion } from '../../src/types/api/regions.js'
import { requireUser } from './auth.js'
import { createDb } from './db.js'
import { badRequest, conflict, methodNotAllowed, notFound, ok } from './http.js'
import type { Handler } from './types.js'

interface RegionRow {
  region_id: string
  sido: string
  sigungu: string
  emd: string
  display_name: string
  short_name: string
  loaded: boolean
  parcel_count: number
  size_label: string
  sort_order: number
}

function rowToRegion(row: RegionRow): Region {
  return {
    id: row.region_id,
    sido: row.sido,
    sigungu: row.sigungu,
    emd: row.emd,
    displayName: row.display_name,
    shortName: row.short_name,
    loaded: row.loaded,
    parcelCount: row.parcel_count,
    sizeLabel: row.size_label,
    sortOrder: row.sort_order,
  }
}

const REGION_COLUMNS =
  'region_id, sido, sigungu, emd, display_name, short_name, loaded, parcel_count, size_label, sort_order'

interface UserRegionRow {
  region_id: string
  acquired_at: string
}

function rowToUserRegion(row: UserRegionRow): UserRegion {
  return { regionId: row.region_id, acquiredAt: row.acquired_at }
}

/**
 * GET /api/regions — 전역 공개 카탈로그(인증 불요, AC-1).
 * regions 전량을 sort_order 순으로 반환(regionsResponseSchema). 적재 region이 앞에 온다.
 */
export const regionsCatalogHandler: Handler = async (req, ctx) => {
  if (req.method !== 'GET') return methodNotAllowed()
  const db = createDb(ctx.env)
  const { data, error } = await db
    .from('regions')
    .select(REGION_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('region_id', { ascending: true })
  if (error) throw new Error(error.message)
  return { status: 200, body: ((data ?? []) as RegionRow[]).map(rowToRegion) }
}

/**
 * GET /api/regions/mine — 로그인 사용자의 받은 지역 목록(requireUser, AC-11).
 * 같은 user_id면 토큰/기기와 무관하게 동일 목록(기기 독립 영속).
 */
export const regionsMineHandler: Handler = async (req, ctx) => {
  if (req.method !== 'GET') return methodNotAllowed()
  const auth = await requireUser(ctx)
  if ('response' in auth) return auth.response
  const db = createDb(ctx.env)
  const { data, error } = await db
    .from('user_regions')
    .select('region_id, acquired_at')
    .eq('user_id', auth.user.id)
    .order('acquired_at', { ascending: true })
  if (error) throw new Error(error.message)
  return { status: 200, body: ((data ?? []) as UserRegionRow[]).map(rowToUserRegion) }
}

/**
 * POST /api/regions/:id/acquire — 받기(requireUser).
 * 대상 region 미존재 404 / loaded=false("준비 중") 409(AC-8) / 멱등 upsert 후 200(AC-7).
 * 이미 받았으면 기존 acquired_at을 유지해 반환(onConflict ignoreDuplicates로 중복 키 무시).
 */
export const regionAcquireHandler: Handler = async (req, ctx) => {
  if (req.method !== 'POST') return methodNotAllowed()
  const parsed = regionAcquireRequestSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(parsed.error)
  const auth = await requireUser(ctx)
  if ('response' in auth) return auth.response

  const regionId = req.params.id
  const db = createDb(ctx.env)

  const { data: region, error: regionError } = await db
    .from('regions')
    .select('region_id, loaded')
    .eq('region_id', regionId)
    .maybeSingle()
  if (regionError) throw new Error(regionError.message)
  if (!region) return notFound('지역을 찾을 수 없습니다')
  if (!(region as { loaded: boolean }).loaded) {
    return conflict('아직 데이터가 적재되지 않은 지역입니다(준비 중)')
  }

  // 멱등 — 이미 받았으면 중복 키를 무시하고 기존 행을 그대로 둔다(acquired_at 보존).
  const { error: upsertError } = await db
    .from('user_regions')
    .upsert(
      { user_id: auth.user.id, region_id: regionId },
      { onConflict: 'user_id,region_id', ignoreDuplicates: true },
    )
  if (upsertError) throw new Error(upsertError.message)

  const { data: row, error: readError } = await db
    .from('user_regions')
    .select('region_id, acquired_at')
    .eq('user_id', auth.user.id)
    .eq('region_id', regionId)
    .single()
  if (readError) throw new Error(readError.message)

  return { status: 200, body: rowToUserRegion(row as UserRegionRow) }
}

/**
 * DELETE /api/regions/:id — 받은 목록에서 제거(requireUser, AC-9).
 * 해당 (user_id, region_id) user_regions 행만 삭제 — parcels 마스터·타 사용자 목록 무영향.
 * 활성 region 보호 가드(AC-14)는 클라이언트가 1차 강제 — 서버는 행 삭제만 수행.
 */
export const regionRemoveHandler: Handler = async (req, ctx) => {
  if (req.method !== 'DELETE') return methodNotAllowed()
  const parsed = regionRemoveRequestSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(parsed.error)
  const auth = await requireUser(ctx)
  if ('response' in auth) return auth.response

  const db = createDb(ctx.env)
  const { error } = await db
    .from('user_regions')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('region_id', req.params.id)
  if (error) throw new Error(error.message)
  return ok()
}
