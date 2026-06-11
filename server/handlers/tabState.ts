import {
  importTabRequestSchema,
  resetTabRequestSchema,
  upsertGroupRequestSchema,
  upsertParcelRequestSchema,
} from '../../src/types/api/tabState'
import type { Group, ParcelOverride, TabStateResponse } from '../../src/types/api/tabState'
import { createDb } from './db'
import type { Db } from './db'
import { badRequest, methodNotAllowed, notFound, ok } from './http'
import { genGroupIds } from './ids'
import { buildResetPatch, isClearedOverride, normalizeOverride } from './override'
import type { Handler } from './types'

interface SettingRow {
  tab_id: string
  parcel_local_id: string
  color: string | null
  style: 'fill' | 'border' | null
  name: string | null
  memo: string | null
  pinned: boolean | null
  icon: string | null
}

interface GroupRow {
  group_id: string
  tab_id: string
  name: string | null
  memo: string | null
  color: string | null
  style: string | null
  parcel_ids: string[] | null
}

const SETTING_COLUMNS = 'tab_id, parcel_local_id, color, style, name, memo, pinned, icon'
const GROUP_COLUMNS = 'group_id, tab_id, name, memo, color, style, parcel_ids'

/** PostgREST 한 요청 1,000행 제한 회피용 배치 크기 */
const INSERT_CHUNK = 500

function rowToOverride(row: SettingRow): ParcelOverride {
  return {
    color: row.color,
    style: row.style,
    name: row.name,
    memo: row.memo,
    pinned: row.pinned ?? false,
    icon: row.icon,
  }
}

function rowToGroup(row: GroupRow): Group {
  return {
    name: row.name,
    memo: row.memo,
    color: row.color,
    style: row.style === 'border' ? 'border' : 'fill',
    parcelIds: row.parcel_ids ?? [],
  }
}

async function tabExists(db: Db, tabId: string): Promise<boolean> {
  const { data, error } = await db.from('tabs').select('tab_id').eq('tab_id', tabId).maybeSingle()
  if (error) throw new Error(error.message)
  return data !== null
}

const TAB_NOT_FOUND = '탭을 찾을 수 없습니다'

/** GET /api/tabs/:tabId/state */
export const tabStateHandler: Handler = async (req, ctx) => {
  if (req.method !== 'GET') return methodNotAllowed()
  const tabId = req.params.tabId
  const db = createDb(ctx.env)
  if (!(await tabExists(db, tabId))) return notFound(TAB_NOT_FOUND)

  const [settingsRes, groupsRes] = await Promise.all([
    db.from('parcel_settings').select(SETTING_COLUMNS).eq('tab_id', tabId),
    db.from('parcel_groups').select(GROUP_COLUMNS).eq('tab_id', tabId),
  ])
  if (settingsRes.error) throw new Error(settingsRes.error.message)
  if (groupsRes.error) throw new Error(groupsRes.error.message)

  const overrides: TabStateResponse['overrides'] = {}
  for (const row of (settingsRes.data ?? []) as SettingRow[]) {
    overrides[row.parcel_local_id] = rowToOverride(row)
  }
  const groups: TabStateResponse['groups'] = {}
  for (const row of (groupsRes.data ?? []) as GroupRow[]) {
    groups[row.group_id] = rowToGroup(row)
  }
  return { status: 200, body: { overrides, groups } }
}

/** POST /api/tabs/:tabId/parcels/:id — upsert, 전 의미 필드 null·pinned=false면 행 삭제 */
export const tabParcelHandler: Handler = async (req, ctx) => {
  if (req.method !== 'POST') return methodNotAllowed()
  const parsed = upsertParcelRequestSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(parsed.error)
  const { tabId, id: parcelId } = req.params
  const db = createDb(ctx.env)
  if (!(await tabExists(db, tabId))) return notFound(TAB_NOT_FOUND)

  const fields = normalizeOverride({
    color: parsed.data.color ?? null,
    style: parsed.data.style ?? null,
    name: parsed.data.name ?? null,
    memo: parsed.data.memo ?? null,
    pinned: parsed.data.pinned ?? false,
    icon: parsed.data.icon ?? null,
  })

  if (isClearedOverride(fields)) {
    const { error } = await db
      .from('parcel_settings')
      .delete()
      .eq('tab_id', tabId)
      .eq('parcel_local_id', parcelId)
    if (error) throw new Error(error.message)
    return ok()
  }

  const { error } = await db.from('parcel_settings').upsert(
    {
      tab_id: tabId,
      parcel_local_id: parcelId,
      ...fields,
      updated_by: parsed.data.clientId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tab_id,parcel_local_id' },
  )
  if (error) {
    // parcels FK 위반 — 정적 지오데이터에 없는 필지 id
    if (error.code === '23503') return notFound('필지를 찾을 수 없습니다')
    throw new Error(error.message)
  }
  return ok()
}

/** POST /api/tabs/:tabId/groups — upsert / group: null = 삭제 */
export const tabGroupsHandler: Handler = async (req, ctx) => {
  if (req.method !== 'POST') return methodNotAllowed()
  const parsed = upsertGroupRequestSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(parsed.error)
  const tabId = req.params.tabId
  const { groupId, group, clientId } = parsed.data
  const db = createDb(ctx.env)
  if (!(await tabExists(db, tabId))) return notFound(TAB_NOT_FOUND)

  if (group === null) {
    const { error } = await db
      .from('parcel_groups')
      .delete()
      .eq('tab_id', tabId)
      .eq('group_id', groupId)
    if (error) throw new Error(error.message)
    return ok()
  }

  const { error } = await db.from('parcel_groups').upsert(
    {
      group_id: groupId,
      tab_id: tabId,
      name: group.name,
      memo: group.memo,
      color: group.color,
      style: group.style,
      parcel_ids: group.parcelIds,
      updated_by: clientId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'group_id' },
  )
  if (error) throw new Error(error.message)
  return ok()
}

/** POST /api/tabs/:tabId/reset — 선택 초기화, pinned 보호, 스냅샷 부수효과 없음 (v1 보존-축소) */
export const tabResetHandler: Handler = async (req, ctx) => {
  if (req.method !== 'POST') return methodNotAllowed()
  const parsed = resetTabRequestSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(parsed.error)
  const tabId = req.params.tabId
  const { items, clientId } = parsed.data
  const db = createDb(ctx.env)
  if (!(await tabExists(db, tabId))) return notFound(TAB_NOT_FOUND)

  if (items.includes('group')) {
    const { error } = await db.from('parcel_groups').delete().eq('tab_id', tabId)
    if (error) throw new Error(error.message)
  }

  const patch = buildResetPatch(items)
  if (Object.keys(patch).length > 0) {
    const { error } = await db
      .from('parcel_settings')
      .update({ ...patch, updated_by: clientId, updated_at: new Date().toISOString() })
      .eq('tab_id', tabId)
      .not('pinned', 'is', true)
    if (error) throw new Error(error.message)

    // 의미 필드가 모두 비워진 비고정 행은 청소 (clear 판정과 동일 규칙)
    const { data: remaining, error: selectError } = await db
      .from('parcel_settings')
      .select(SETTING_COLUMNS)
      .eq('tab_id', tabId)
    if (selectError) throw new Error(selectError.message)
    const toDelete = ((remaining ?? []) as SettingRow[])
      .filter((row) => isClearedOverride(rowToOverride(row)))
      .map((row) => row.parcel_local_id)
    if (toDelete.length > 0) {
      const { error: deleteError } = await db
        .from('parcel_settings')
        .delete()
        .eq('tab_id', tabId)
        .in('parcel_local_id', toDelete)
      if (deleteError) throw new Error(deleteError.message)
    }
  }

  return ok()
}

/** PUT /api/tabs/:tabId/import — 탭의 settings/groups 전체 교체 (포맷 검증 상세는 M-12) */
export const tabImportHandler: Handler = async (req, ctx) => {
  if (req.method !== 'PUT') return methodNotAllowed()
  const parsed = importTabRequestSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(parsed.error)
  const tabId = req.params.tabId
  const { overrides, groups, clientId } = parsed.data
  const db = createDb(ctx.env)
  if (!(await tabExists(db, tabId))) return notFound(TAB_NOT_FOUND)

  const now = new Date().toISOString()

  const { error: deleteSettingsError } = await db
    .from('parcel_settings')
    .delete()
    .eq('tab_id', tabId)
  if (deleteSettingsError) throw new Error(deleteSettingsError.message)
  const { error: deleteGroupsError } = await db.from('parcel_groups').delete().eq('tab_id', tabId)
  if (deleteGroupsError) throw new Error(deleteGroupsError.message)

  const settingRows = Object.entries(overrides)
    .map(([parcelId, override]) => ({ parcelId, fields: normalizeOverride(override) }))
    .filter(({ fields }) => !isClearedOverride(fields))
    .map(({ parcelId, fields }) => ({
      tab_id: tabId,
      parcel_local_id: parcelId,
      ...fields,
      updated_by: clientId,
      updated_at: now,
    }))
  for (let i = 0; i < settingRows.length; i += INSERT_CHUNK) {
    const { error } = await db
      .from('parcel_settings')
      .insert(settingRows.slice(i, i + INSERT_CHUNK))
    if (error) {
      if (error.code === '23503') return badRequest('존재하지 않는 필지를 참조하는 항목이 있습니다')
      throw new Error(error.message)
    }
  }

  // group_id는 전부 재생성 — 다른 탭에서 내보낸 파일과의 PK 충돌 방지
  const groupEntries = Object.values(groups)
  const newIds = genGroupIds(groupEntries.length)
  const groupRows = groupEntries.map((group, i) => ({
    group_id: newIds[i],
    tab_id: tabId,
    name: group.name,
    memo: group.memo,
    color: group.color,
    style: group.style,
    parcel_ids: group.parcelIds,
    updated_by: clientId,
    updated_at: now,
  }))
  for (let i = 0; i < groupRows.length; i += INSERT_CHUNK) {
    const { error } = await db.from('parcel_groups').insert(groupRows.slice(i, i + INSERT_CHUNK))
    if (error) throw new Error(error.message)
  }

  return ok()
}
