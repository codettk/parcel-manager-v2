/**
 * v1 운영 DB → v2 정규화 스키마 1회성 시드 (Phase 5 §8.1).
 *
 * 실행: pnpm seed:v1 [--dry-run] [--source=dev|prod] [--force]
 * 전제:
 *   - 쓰기(v2): .env의 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (service role). import-parcels 선례.
 *   - 읽기(v1): V1_SUPABASE_URL / V1_SUPABASE_ANON_KEY env, 없으면 --source=dev|prod로 v1 .env 키 선택.
 *   - v2 로컬/운영 Supabase에 0001 스키마 + import:parcels(parcels.json 4,409) 선적재.
 *
 * v1에 대한 쓰기는 어떤 경우에도 발생하지 않는다 (anon 읽기 전용).
 *
 * 6단계 이관: parcels(보강 update) → 기본 탭 → overrides(권위 규칙) → groups → color_labels → app_config + 스냅샷→닫힌 탭.
 * 핵심 로직은 runSeed로 export — 테스트에서 v1 인메모리 fixture·로컬 v2 Supabase로 호출(실 v1 DB 미접근).
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClientOptions } from '@supabase/supabase-js'
import { createDb } from '../server/handlers/db'
import type { Db } from '../server/handlers/db'
import { genGroupIds, genTabId } from '../server/handlers/ids'
import { isClearedOverride, normalizeOverride } from '../src/utils/override'
import type { ParcelOverride } from '../src/types/api/tabState'

/* ============================================================
 * v1 읽기 형상 (운영 DB 실스키마 기준 — API zod 계약 아님)
 * ============================================================ */

/** v1 parcels 행 (폐기 3컬럼 포함 — 시드 매핑에서 제외) */
export interface V1ParcelRow {
  local_id: string
  pnu?: string | null
  jibun?: string | null
  jibun_full?: string | null
  ld_code?: string | null
  ld_code_nm?: string | null
  lndcgr_code?: string | null
  lndcgr_code_nm?: string | null
  lndpcl_ar?: number | null
  posesn_se_code?: string | null
  posesn_se_code_nm?: string | null
  cnrs_psn_co?: number | null
  regstr_se_code?: string | null
  regstr_se_code_nm?: string | null
  coordinates?: unknown
  vworld_fetched_at?: string | null
  // 폐기 3컬럼 — 읽되 v2로 복사하지 않는다
  lad_frtl_sc?: string | null
  lad_frtl_sc_nm?: string | null
  last_updt_dt?: string | null
}

/** v1 parcel_settings 행 (운영 DB는 pinned·icon 컬럼 보유 — 0001 SQL에는 없으나 실스키마엔 존재) */
export interface V1SettingRow {
  parcel_local_id: string
  color?: string | null
  style?: string | null
  name?: string | null
  memo?: string | null
  pinned?: boolean | null
  icon?: string | null
}

/** v1 parcel_groups 행 */
export interface V1GroupRow {
  group_id: string
  name?: string | null
  memo?: string | null
  color?: string | null
  style?: string | null
  parcel_ids?: string[] | null
}

/** v1 color_labels 행 (hex가 없을 수 있음 — 기본 6색 보충 대상) */
export interface V1ColorRow {
  color_id: string
  label: string
  hex?: string | null
  sort_order?: number | null
}

/** v1 app_config 행 */
export interface V1ConfigRow {
  key: string
  value: unknown
}

/** reset_snapshots 항목 — 스냅샷 1개당 v2 닫힌 탭 1개 */
export interface V1Snapshot {
  label?: string | null
  createdAt?: string | null
  data?: {
    overrides?: Record<string, Partial<ParcelOverride>> | null
    groups?: Record<string, V1SnapshotGroup> | null
  } | null
}

export interface V1SnapshotGroup {
  name?: string | null
  memo?: string | null
  color?: string | null
  style?: string | null
  parcelIds?: string[] | null
  parcel_ids?: string[] | null
}

/**
 * v1 읽기 인터페이스 — supabase 클라이언트 메서드 전체가 아니라
 * 시드에 필요한 "테이블 전량 읽기"만 노출한다. 테스트는 이 인터페이스를
 * 인메모리 fixture로 구현해 실 v1 DB 없이 runSeed를 호출한다.
 */
export interface V1Reader {
  parcels(): Promise<V1ParcelRow[]>
  parcelSettings(): Promise<V1SettingRow[]>
  parcelGroups(): Promise<V1GroupRow[]>
  colorLabels(): Promise<V1ColorRow[]>
  appConfig(): Promise<V1ConfigRow[]>
  /** app_state 단일 행 (parcels override 권위 소스 + 레거시 color_labels 폴백) */
  appState(): Promise<V1AppState | null>
}

/** v1 app_state — 운영 권위 소스. parcels override 맵 + 레거시 color_labels {id:label} */
export interface V1AppState {
  parcels?: Record<string, Partial<ParcelOverride>> | null
  color_labels?: Record<string, string> | null
}

/* ============================================================
 * 상수
 * ============================================================ */

const SEED_CLIENT_ID = 'seed-v1-migration'
const DEFAULT_TAB_NAME = '기본 작업공간'

/** 기본 6색 hex (supabase/seed.sql·v1 constants.js 계승). hex 부재 색의 보충 소스. */
const DEFAULT_COLOR_HEX: Record<string, string> = {
  eco: '#6CA945',
  sun: '#E5A300',
  sky: '#2B7BC9',
  rose: '#C8392E',
  plum: '#8B5CF6',
  soil: '#8C6B3F',
}
/** color_id가 기본 6색이 아닐 때의 최종 폴백 hex */
const FALLBACK_HEX = '#888888'

const CHUNK = 500

/* ============================================================
 * SeedReport
 * ============================================================ */

export interface SnapshotReport {
  label: string
  tabId: string
  overridesSource: number
  settingsInserted: number
  settingsOmitted: number
  groups: number
}

export interface SeedReport {
  dryRun: boolean
  source: string
  parcels: { v1: number; upserted: number }
  defaultTab: { tabId: string; created: boolean }
  overrides: {
    authority: 'app_state.parcels' | 'parcel_settings'
    sourceRows: number
    inserted: number
    omitted: number
    pinned: number
  }
  groups: { inserted: number; emptyNameNormalized: number }
  colors: { inserted: number; hexBackfilled: number; legacyFallback: boolean }
  calcRecipes: number
  snapshots: SnapshotReport[]
}

export interface SeedOptions {
  dryRun: boolean
  force: boolean
  source?: string
}

/* ============================================================
 * 헬퍼
 * ============================================================ */

/** v1 override(부분 형상) → v2 ParcelOverride 정규화 입력으로 채움 */
function toOverrideInput(raw: Partial<ParcelOverride> | V1SettingRow): ParcelOverride {
  const style = raw.style === 'fill' || raw.style === 'border' ? raw.style : null
  return normalizeOverride({
    color: raw.color ?? null,
    style,
    name: raw.name ?? null,
    memo: raw.memo ?? null,
    pinned: raw.pinned ?? false,
    icon: raw.icon ?? null,
  })
}

function hexFor(
  colorId: string,
  hex: string | null | undefined,
): { hex: string; backfilled: boolean } {
  if (hex && /^#[0-9a-fA-F]{6}$/.test(hex)) return { hex, backfilled: false }
  return { hex: DEFAULT_COLOR_HEX[colorId] ?? FALLBACK_HEX, backfilled: true }
}

function groupName(name: string | null | undefined): { name: string | null; normalized: boolean } {
  if (name == null || name === '') return { name: null, normalized: name === '' }
  return { name, normalized: false }
}

function snapshotGroupParcelIds(g: V1SnapshotGroup): string[] {
  return g.parcelIds ?? g.parcel_ids ?? []
}

async function chunkedUpsert(
  db: Db,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict })
    if (error) throw new Error(`${table} upsert 실패 (offset ${i}): ${error.message}`)
  }
}

/* ============================================================
 * 단계 1: parcels 보강 (update — coordinates 보존)
 * ============================================================ */

/**
 * coordinates 처리 결정 (명세 §비범위 미결 → backend 결정):
 *   v2 parcels.coordinates는 NOT NULL이고, 좌표 마스터는 이미 import:parcels(parcels.json 4,409)로 적재됐다.
 *   따라서 시드의 parcels 단계는 기존 v2 행에 pnu·V-World·지목 컬럼만 **update**(local_id 매칭)하고
 *   coordinates는 건드리지 않는다 — v1 좌표가 다른 출처여도 검증된 지오데이터를 덮어쓰지 않기 위함.
 *   v2에 없는 local_id(신규)는 v1 coordinates가 있을 때만 insert, 없으면 건너뛴다(NOT NULL 위반 회피).
 */
async function seedParcels(
  v2Db: Db,
  v1Parcels: V1ParcelRow[],
  dryRun: boolean,
): Promise<{ v1: number; upserted: number }> {
  if (dryRun) return { v1: v1Parcels.length, upserted: v1Parcels.length }

  // v2에 이미 존재하는 local_id 집합 (보강 update 대상)
  const existing = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await v2Db
      .from('parcels')
      .select('local_id')
      .order('local_id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`v2 parcels 조회 실패: ${error.message}`)
    const rows = (data ?? []) as { local_id: string }[]
    for (const r of rows) existing.add(r.local_id)
    if (rows.length < 1000) break
  }

  // 폐기 3컬럼(lad_frtl_sc·lad_frtl_sc_nm·last_updt_dt) 제외, V-World/지목/pnu 보강 필드만.
  // jibun·jibun_full·coordinates는 절대 쓰지 않는다 — parcels.json import가 권위 소스이며
  // 기존 master 행의 지번/좌표를 v1 값으로 덮어쓰면 안 된다(코드 v2 마스터 보존 결정).
  const enrich = (p: V1ParcelRow): Record<string, unknown> => ({
    pnu: p.pnu ?? null,
    ld_code: p.ld_code ?? null,
    ld_code_nm: p.ld_code_nm ?? null,
    lndcgr_code: p.lndcgr_code ?? null,
    lndcgr_code_nm: p.lndcgr_code_nm ?? null,
    lndpcl_ar: p.lndpcl_ar ?? null,
    posesn_se_code: p.posesn_se_code ?? null,
    posesn_se_code_nm: p.posesn_se_code_nm ?? null,
    cnrs_psn_co: p.cnrs_psn_co ?? null,
    regstr_se_code: p.regstr_se_code ?? null,
    regstr_se_code_nm: p.regstr_se_code_nm ?? null,
    vworld_fetched_at: p.vworld_fetched_at ?? null,
  })

  let upserted = 0
  const inserts: Record<string, unknown>[] = []
  for (const p of v1Parcels) {
    if (existing.has(p.local_id)) {
      const { error } = await v2Db.from('parcels').update(enrich(p)).eq('local_id', p.local_id)
      if (error) throw new Error(`parcels 보강 실패 (${p.local_id}): ${error.message}`)
      upserted += 1
    } else if (p.coordinates != null) {
      // 신규 행(v2 master에 없는 local_id)은 coordinates(NOT NULL)가 있을 때만 insert.
      // 신규 행은 import 권위 소스가 없으므로 v1 jibun·coordinates를 그대로 넣는다.
      inserts.push({
        local_id: p.local_id,
        coordinates: p.coordinates,
        jibun: p.jibun ?? null,
        jibun_full: p.jibun_full ?? null,
        ...enrich(p),
      })
    }
    // coordinates 없는 신규 행은 건너뛴다 (NOT NULL 위반 회피)
  }
  if (inserts.length > 0) {
    await chunkedUpsert(v2Db, 'parcels', inserts, 'local_id')
    upserted += inserts.length
  }
  return { v1: v1Parcels.length, upserted }
}

/* ============================================================
 * 단계 2: 기본 탭
 * ============================================================ */

async function ensureDefaultTab(
  v2Db: Db,
  dryRun: boolean,
): Promise<{ tabId: string; created: boolean }> {
  // 이미 활성 탭이 있으면 첫 활성 탭을 기본 탭으로 재사용 (멱등)
  const { data, error } = await v2Db
    .from('tabs')
    .select('tab_id')
    .is('closed_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw new Error(`v2 tabs 조회 실패: ${error.message}`)
  const existing = (data ?? []) as { tab_id: string }[]
  if (existing.length > 0) return { tabId: existing[0].tab_id, created: false }

  const tabId = genTabId()
  if (dryRun) return { tabId, created: true }
  const { error: insertError } = await v2Db.from('tabs').insert({
    tab_id: tabId,
    name: DEFAULT_TAB_NAME,
    sort_order: 0,
    closed_at: null,
    updated_by: SEED_CLIENT_ID,
  })
  if (insertError) throw new Error(`기본 탭 생성 실패: ${insertError.message}`)
  return { tabId, created: true }
}

/* ============================================================
 * 단계 3: overrides → parcel_settings (권위 규칙)
 * ============================================================ */

interface OverrideResult {
  authority: 'app_state.parcels' | 'parcel_settings'
  sourceRows: number
  inserted: number
  omitted: number
  pinned: number
}

/** 권위 규칙 적용 + 정규화 → parcel_settings 행 빌드 (쓰기는 호출자) */
function buildSettings(
  tabId: string,
  appStateParcels: Record<string, Partial<ParcelOverride>> | null | undefined,
  v1Settings: V1SettingRow[],
): { rows: Record<string, unknown>[]; result: OverrideResult } {
  const useAppState = appStateParcels != null && Object.keys(appStateParcels).length > 0
  const entries: { parcelId: string; input: ParcelOverride }[] = []

  if (useAppState && appStateParcels) {
    for (const [parcelId, raw] of Object.entries(appStateParcels)) {
      entries.push({ parcelId, input: toOverrideInput(raw) })
    }
  } else {
    for (const s of v1Settings) {
      entries.push({ parcelId: s.parcel_local_id, input: toOverrideInput(s) })
    }
  }

  const rows: Record<string, unknown>[] = []
  let omitted = 0
  let pinned = 0
  for (const { parcelId, input } of entries) {
    if (isClearedOverride(input)) {
      omitted += 1
      continue
    }
    if (input.pinned) pinned += 1
    rows.push({
      tab_id: tabId,
      parcel_local_id: parcelId,
      color: input.color,
      style: input.style,
      name: input.name,
      memo: input.memo,
      pinned: input.pinned,
      icon: input.icon,
      updated_by: SEED_CLIENT_ID,
    })
  }

  return {
    rows,
    result: {
      authority: useAppState ? 'app_state.parcels' : 'parcel_settings',
      sourceRows: entries.length,
      inserted: rows.length,
      omitted,
      pinned,
    },
  }
}

/* ============================================================
 * 단계 4: parcel_groups
 * ============================================================ */

function buildGroups(
  tabId: string,
  v1Groups: V1GroupRow[],
): { rows: Record<string, unknown>[]; emptyNameNormalized: number } {
  let emptyNameNormalized = 0
  const rows = v1Groups.map((g) => {
    const { name, normalized } = groupName(g.name)
    if (normalized) emptyNameNormalized += 1
    const style = g.style === 'fill' || g.style === 'border' ? g.style : 'fill'
    return {
      group_id: g.group_id,
      tab_id: tabId,
      name,
      memo: g.memo ?? null,
      color: g.color ?? null,
      style,
      parcel_ids: g.parcel_ids ?? [],
      updated_by: SEED_CLIENT_ID,
    }
  })
  return { rows, emptyNameNormalized }
}

/* ============================================================
 * 단계 5: color_labels
 * ============================================================ */

function buildColors(
  v1Colors: V1ColorRow[],
  legacyMap: Record<string, string> | null | undefined,
): { rows: Record<string, unknown>[]; hexBackfilled: number; legacyFallback: boolean } {
  let hexBackfilled = 0
  let source: { color_id: string; label: string; hex?: string | null; sort_order?: number | null }[]
  let legacyFallback = false

  if (v1Colors.length > 0) {
    source = v1Colors
  } else if (legacyMap && Object.keys(legacyMap).length > 0) {
    legacyFallback = true
    source = Object.entries(legacyMap).map(([color_id, label], i) => ({
      color_id,
      label,
      hex: null,
      sort_order: i,
    }))
  } else {
    source = []
  }

  const rows = source.map((c, i) => {
    const { hex, backfilled } = hexFor(c.color_id, c.hex)
    if (backfilled) hexBackfilled += 1
    return {
      color_id: c.color_id,
      label: c.label,
      hex,
      sort_order: c.sort_order ?? i,
      updated_by: SEED_CLIENT_ID,
    }
  })
  return { rows, hexBackfilled, legacyFallback }
}

/* ============================================================
 * 단계 6: 스냅샷 → 닫힌 탭
 * ============================================================ */

interface SnapshotPlan {
  tab: Record<string, unknown>
  settings: Record<string, unknown>[]
  groups: Record<string, unknown>[]
  report: SnapshotReport
}

function buildSnapshotPlans(snapshots: V1Snapshot[], baseSortOrder: number): SnapshotPlan[] {
  return snapshots.map((snap, idx) => {
    const tabId = genTabId(Date.now() + idx) // idx로 timestamp 분산 — 동일 배치 충돌 방지
    const label = snap.label && snap.label !== '' ? snap.label : `스냅샷 ${idx + 1}`
    const closedAt = snap.createdAt ?? new Date().toISOString()

    // overrides → settings (동일 정규화)
    const overrides = snap.data?.overrides ?? {}
    const overridesSource = Object.keys(overrides).length
    const settings: Record<string, unknown>[] = []
    let settingsOmitted = 0
    for (const [parcelId, raw] of Object.entries(overrides)) {
      const input = toOverrideInput(raw)
      if (isClearedOverride(input)) {
        settingsOmitted += 1
        continue
      }
      settings.push({
        tab_id: tabId,
        parcel_local_id: parcelId,
        color: input.color,
        style: input.style,
        name: input.name,
        memo: input.memo,
        pinned: input.pinned,
        icon: input.icon,
        updated_by: SEED_CLIENT_ID,
      })
    }

    // groups → group_id 전부 재생성 (C-3 선례)
    const groupEntries = Object.values(snap.data?.groups ?? {})
    const newIds = genGroupIds(groupEntries.length)
    const groups = groupEntries.map((g, gi) => {
      const { name } = groupName(g.name)
      const style = g.style === 'fill' || g.style === 'border' ? g.style : 'fill'
      return {
        group_id: newIds[gi],
        tab_id: tabId,
        name,
        memo: g.memo ?? null,
        color: g.color ?? null,
        style,
        parcel_ids: snapshotGroupParcelIds(g),
        updated_by: SEED_CLIENT_ID,
      }
    })

    return {
      tab: {
        tab_id: tabId,
        name: label,
        sort_order: baseSortOrder + idx + 1,
        closed_at: closedAt,
        updated_by: SEED_CLIENT_ID,
      },
      settings,
      groups,
      report: {
        label,
        tabId,
        overridesSource,
        settingsInserted: settings.length,
        settingsOmitted,
        groups: groups.length,
      },
    }
  })
}

/* ============================================================
 * 재실행 가드
 * ============================================================ */

interface GuardState {
  settings: number
  groups: number
}

async function inspectV2(v2Db: Db): Promise<GuardState> {
  const settings = await countRows(v2Db, 'parcel_settings')
  const groups = await countRows(v2Db, 'parcel_groups')
  return { settings, groups }
}

async function countRows(v2Db: Db, table: string): Promise<number> {
  const res = await v2Db.from(table).select('*', { count: 'exact', head: true })
  if (res.error) throw new Error(`${table} count 실패: ${res.error.message}`)
  return res.count ?? 0
}

/** --force: parcels 마스터를 제외한 비-parcels 데이터 전량 삭제 */
async function purgeNonParcels(v2Db: Db): Promise<void> {
  // FK CASCADE(parcel_settings·parcel_groups → tabs)로 tabs 삭제 시 함께 비워지나, 명시적으로 순서 보장
  const delAll = async (table: string, neqKey: string): Promise<void> => {
    const { error } = await v2Db.from(table).delete().neq(neqKey, '__never__')
    if (error) throw new Error(`${table} 비우기 실패: ${error.message}`)
  }
  await delAll('parcel_settings', 'parcel_local_id')
  await delAll('parcel_groups', 'group_id')
  await delAll('tabs', 'tab_id')
  await delAll('color_labels', 'color_id')
  await delAll('app_config', 'key')
}

/* ============================================================
 * runSeed
 * ============================================================ */

export async function runSeed(v1: V1Reader, v2Db: Db, opts: SeedOptions): Promise<SeedReport> {
  const { dryRun, force } = opts
  const source = opts.source ?? 'env'

  // 재실행 가드 (dry-run은 무관 — 쓰기 0)
  if (!dryRun) {
    const state = await inspectV2(v2Db)
    const alreadySeeded = state.settings > 0 || state.groups > 0
    if (alreadySeeded && !force) {
      throw new Error(
        `v2에 이미 시드 흔적이 있습니다 (parcel_settings ${state.settings}, parcel_groups ${state.groups}). ` +
          `재시드하려면 --force를 사용하세요.`,
      )
    }
    if (force) await purgeNonParcels(v2Db)
  }

  // v1 전량 읽기 (읽기 전용)
  const [v1Parcels, v1Settings, v1Groups, v1Colors, v1Config, appState] = await Promise.all([
    v1.parcels(),
    v1.parcelSettings(),
    v1.parcelGroups(),
    v1.colorLabels(),
    v1.appConfig(),
    v1.appState(),
  ])

  // 1) parcels 보강
  const parcels = await seedParcels(v2Db, v1Parcels, dryRun)

  // 2) 기본 탭
  const defaultTab = await ensureDefaultTab(v2Db, dryRun)

  // 3) overrides → parcel_settings
  const { rows: settingRows, result: overrideResult } = buildSettings(
    defaultTab.tabId,
    appState?.parcels,
    v1Settings,
  )
  if (!dryRun && settingRows.length > 0) {
    await chunkedUpsert(v2Db, 'parcel_settings', settingRows, 'tab_id,parcel_local_id')
  }

  // 4) parcel_groups
  const { rows: groupRows, emptyNameNormalized } = buildGroups(defaultTab.tabId, v1Groups)
  if (!dryRun && groupRows.length > 0) {
    await chunkedUpsert(v2Db, 'parcel_groups', groupRows, 'group_id')
  }

  // 5) color_labels
  const {
    rows: colorRows,
    hexBackfilled,
    legacyFallback,
  } = buildColors(v1Colors, appState?.color_labels)
  if (!dryRun && colorRows.length > 0) {
    await chunkedUpsert(v2Db, 'color_labels', colorRows, 'color_id')
  }

  // 6) app_config (calc_recipes) + reset_snapshots → 닫힌 탭
  const configMap = new Map(v1Config.map((c) => [c.key, c.value]))
  const calcRecipesValue = configMap.get('calc_recipes')
  const calcRecipes = Array.isArray(calcRecipesValue) ? calcRecipesValue.length : 0
  if (!dryRun && calcRecipesValue !== undefined) {
    const { error } = await v2Db
      .from('app_config')
      .upsert({ key: 'calc_recipes', value: calcRecipesValue }, { onConflict: 'key' })
    if (error) throw new Error(`app_config calc_recipes 복사 실패: ${error.message}`)
  }

  const rawSnapshots = configMap.get('reset_snapshots')
  const snapshots: V1Snapshot[] = Array.isArray(rawSnapshots) ? (rawSnapshots as V1Snapshot[]) : []
  const plans = buildSnapshotPlans(snapshots, 0)
  if (!dryRun) {
    for (const plan of plans) {
      const { error: tabErr } = await v2Db.from('tabs').insert(plan.tab)
      if (tabErr) throw new Error(`스냅샷 탭 생성 실패: ${tabErr.message}`)
      if (plan.settings.length > 0) {
        await chunkedUpsert(v2Db, 'parcel_settings', plan.settings, 'tab_id,parcel_local_id')
      }
      if (plan.groups.length > 0) {
        await chunkedUpsert(v2Db, 'parcel_groups', plan.groups, 'group_id')
      }
    }
  }

  return {
    dryRun,
    source,
    parcels,
    defaultTab,
    overrides: {
      authority: overrideResult.authority,
      sourceRows: overrideResult.sourceRows,
      inserted: overrideResult.inserted,
      omitted: overrideResult.omitted,
      pinned: overrideResult.pinned,
    },
    groups: { inserted: groupRows.length, emptyNameNormalized },
    colors: { inserted: colorRows.length, hexBackfilled, legacyFallback },
    calcRecipes,
    snapshots: plans.map((p) => p.report),
  }
}

/* ============================================================
 * 리포트 출력
 * ============================================================ */

export function printReport(report: SeedReport): void {
  const tag = report.dryRun ? 'dry-run' : '실행'
  console.log(`\n=== v1 → v2 시드 ${tag} (source=${report.source}) ===`)
  console.log(
    `parcels:          v1 ${report.parcels.v1} → v2 upsert ${report.parcels.upserted} (폐기 3컬럼 제외)`,
  )
  console.log(
    `기본 탭:           ${report.defaultTab.created ? '생성' : '재사용'} 1 (${report.defaultTab.tabId}, '${DEFAULT_TAB_NAME}')`,
  )
  console.log(
    `overrides 소스:    ${report.overrides.authority} (${report.overrides.sourceRows}행)   ← 권위 규칙`,
  )
  console.log(
    `  → parcel_settings: ${report.overrides.inserted}행 (${report.overrides.omitted}행 의미없어 생략)`,
  )
  console.log(`  pinned 보존:      ${report.overrides.pinned}행`)
  console.log(
    `parcel_groups:     ${report.groups.inserted}개 (빈 그룹명 정규화 ${report.groups.emptyNameNormalized}개)`,
  )
  console.log(
    `color_labels:      ${report.colors.inserted}개 (hex 보충 ${report.colors.hexBackfilled}개${report.colors.legacyFallback ? ', 레거시 폴백' : ''})`,
  )
  console.log(`calc_recipes:      ${report.calcRecipes}개 레시피`)
  console.log(
    `reset_snapshots:   ${report.snapshots.length}개 → 닫힌 탭 ${report.snapshots.length}개`,
  )
  for (const s of report.snapshots) {
    console.log(
      `  스냅샷 '${s.label}': overrides ${s.overridesSource} → ${s.settingsInserted}행, groups ${s.groups} (group_id 재생성)`,
    )
  }
  console.log(report.dryRun ? '=== 쓰기 0회 (dry-run) ===\n' : '=== 커밋 완료 ===\n')
}

/* ============================================================
 * v1 supabase 클라이언트 → V1Reader 어댑터
 * ============================================================ */

/** 전량 select 페이징 (PostgREST 기본 1000행 캡 우회) */
async function selectAll<T>(client: Db, table: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .range(from, from + 999)
    if (error) throw new Error(`v1 ${table} 읽기 실패: ${error.message}`)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

type RealtimeTransport = NonNullable<
  NonNullable<SupabaseClientOptions<'public'>['realtime']>['transport']
>

/**
 * Node 20에는 native WebSocket이 없어 supabase-js가 클라이언트 생성 시 throw한다.
 * 시드는 Realtime을 쓰지 않으므로 더미 transport로 우회 (createDb 선례).
 */
class UnusedWebSocket {
  constructor() {
    throw new Error('시드 스크립트는 Realtime을 사용하지 않습니다')
  }
}

/** v1 읽기 전용(anon) 클라이언트. service role 우선인 createDb와 별도 경로 (§영향 범위). */
function createV1Client(url: string, key: string): Db {
  return createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: UnusedWebSocket as unknown as RealtimeTransport },
  }) as unknown as Db
}

function makeV1Reader(client: Db): V1Reader {
  return {
    parcels: () => selectAll<V1ParcelRow>(client, 'parcels'),
    parcelSettings: () => selectAll<V1SettingRow>(client, 'parcel_settings'),
    parcelGroups: () => selectAll<V1GroupRow>(client, 'parcel_groups'),
    colorLabels: () => selectAll<V1ColorRow>(client, 'color_labels'),
    appConfig: () => selectAll<V1ConfigRow>(client, 'app_config'),
    appState: async () => {
      // v1 app_state는 단일 행 테이블(또는 단일 row). 없으면 null.
      const { data, error } = await client.from('app_state').select('*').limit(1).maybeSingle()
      if (error) {
        // app_state 테이블 부재(42P01)면 null로 — 권위 규칙이 parcel_settings로 폴백
        if (error.code === '42P01') return null
        throw new Error(`v1 app_state 읽기 실패: ${error.message}`)
      }
      if (!data) return null
      const row = data as { parcels?: unknown; color_labels?: unknown }
      return {
        parcels: (row.parcels ?? null) as V1AppState['parcels'],
        color_labels: (row.color_labels ?? null) as V1AppState['color_labels'],
      }
    },
  }
}

/* ============================================================
 * main — env 파싱·소스 선택·runSeed 호출·리포트 출력만
 * ============================================================ */

function resolveV1Credentials(source: string | undefined): { url: string; key: string } {
  // 우선순위: V1_SUPABASE_URL/ANON_KEY env > --source로 v1 .env 키 선택
  const url = process.env.V1_SUPABASE_URL
  const key = process.env.V1_SUPABASE_ANON_KEY
  if (url && key) return { url, key }

  // --source 폴백: 운영자가 v1 .env 키를 SOURCE 접두로 노출한 경우(예: V1_PROD_URL)
  if (source) {
    const prefix = `V1_${source.toUpperCase()}`
    const sUrl = process.env[`${prefix}_SUPABASE_URL`] ?? process.env[`${prefix}_URL`]
    const sKey = process.env[`${prefix}_SUPABASE_ANON_KEY`] ?? process.env[`${prefix}_ANON_KEY`]
    if (sUrl && sKey) return { url: sUrl, key: sKey }
  }

  throw new Error(
    'v1 읽기 자격증명이 없습니다. V1_SUPABASE_URL / V1_SUPABASE_ANON_KEY를 설정하거나 ' +
      '--source=<env>에 맞는 V1_<SOURCE>_SUPABASE_URL / V1_<SOURCE>_SUPABASE_ANON_KEY를 설정하세요.',
  )
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')
  const sourceArg = process.argv.find((a) => a.startsWith('--source='))?.split('=')[1]

  const { url, key } = resolveV1Credentials(sourceArg)
  const v1 = makeV1Reader(createV1Client(url, key))
  const v2Db = createDb(process.env)

  console.log(`v1 → v2 시드 시작 (dryRun=${dryRun}, force=${force}, source=${sourceArg ?? 'env'})`)
  const report = await runSeed(v1, v2Db, { dryRun, force, source: sourceArg ?? 'env' })
  printReport(report)
}

// 직접 실행 시에만 main 구동 — import(테스트) 시에는 실행하지 않는다 (fetch-vworld 선례)
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('migrate-v1-data.ts')
) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
}
