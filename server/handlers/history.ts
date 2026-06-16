import {
  deleteHistoryRequestSchema,
  renameHistoryRequestSchema,
  restoreHistoryRequestSchema,
} from '../../src/types/api/history.js'
import type { HistoryItem } from '../../src/types/api/history.js'
import { createDb } from './db.js'
import type { Db } from './db.js'
import { badRequest, methodNotAllowed, notFound, ok } from './http.js'
import { genGroupIds, genTabId } from './ids.js'
import { nextSortOrder, rowToTab } from './tabs.js'
import type { TabRow } from './tabs.js'
import type { Handler } from './types.js'

function rowToHistoryItem(row: TabRow): HistoryItem {
  return { ...rowToTab(row), closedAt: row.closed_at ?? '' }
}

/** closed_at 有 + history_deleted_at 無인 단일 행 조회 */
async function findHistoryRow(db: Db, tabId: string): Promise<TabRow | null> {
  const { data, error } = await db
    .from('tabs')
    .select('*')
    .eq('tab_id', tabId)
    .not('closed_at', 'is', null)
    .is('history_deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as TabRow | null
}

/** GET /api/history */
export const historyCollectionHandler: Handler = async (req, ctx) => {
  if (req.method !== 'GET') return methodNotAllowed()
  const db = createDb(ctx.env)
  const { data, error } = await db
    .from('tabs')
    .select('*')
    .not('closed_at', 'is', null)
    .is('history_deleted_at', null)
    .order('closed_at', { ascending: false })
  if (error) throw new Error(error.message)
  return { status: 200, body: ((data ?? []) as TabRow[]).map(rowToHistoryItem) }
}

/** PATCH /api/history/:id · DELETE /api/history/:id */
export const historyItemHandler: Handler = async (req, ctx) => {
  const tabId = req.params.id

  if (req.method === 'PATCH') {
    const parsed = renameHistoryRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const db = createDb(ctx.env)
    const { data, error } = await db
      .from('tabs')
      .update({
        name: parsed.data.name,
        updated_by: parsed.data.clientId,
        updated_at: new Date().toISOString(),
      })
      .eq('tab_id', tabId)
      .not('closed_at', 'is', null)
      .is('history_deleted_at', null)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return notFound('히스토리 항목을 찾을 수 없습니다')
    return { status: 200, body: rowToHistoryItem(data as TabRow) }
  }

  if (req.method === 'DELETE') {
    const parsed = deleteHistoryRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const db = createDb(ctx.env)
    const source = await findHistoryRow(db, tabId)
    if (!source) return notFound('히스토리 항목을 찾을 수 없습니다')
    const { error } = await db
      .from('tabs')
      .update({
        history_deleted_at: new Date().toISOString(),
        updated_by: parsed.data.clientId,
        updated_at: new Date().toISOString(),
      })
      .eq('tab_id', tabId)
    if (error) throw new Error(error.message)
    return ok()
  }

  return methodNotAllowed()
}

/** POST /api/history/:id/restore — 새 탭 생성 후 settings/groups 복사, group_id 전부 재생성 (C-3) */
export const historyRestoreHandler: Handler = async (req, ctx) => {
  if (req.method !== 'POST') return methodNotAllowed()
  const parsed = restoreHistoryRequestSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(parsed.error)
  const { clientId } = parsed.data
  const db = createDb(ctx.env)

  const source = await findHistoryRow(db, req.params.id)
  if (!source) return notFound('히스토리 항목을 찾을 수 없습니다')

  const now = new Date().toISOString()
  const { data: created, error: insertError } = await db
    .from('tabs')
    .insert({
      tab_id: genTabId(),
      name: source.name,
      sort_order: await nextSortOrder(db),
      updated_by: clientId,
    })
    .select('*')
    .single()
  if (insertError) throw new Error(insertError.message)
  const newTab = created as TabRow

  const { data: settings, error: settingsError } = await db
    .from('parcel_settings')
    .select('parcel_local_id, color, style, name, memo, pinned, icon')
    .eq('tab_id', source.tab_id)
  if (settingsError) throw new Error(settingsError.message)
  const settingRows = (settings ?? []) as Record<string, unknown>[]
  if (settingRows.length > 0) {
    const { error } = await db.from('parcel_settings').insert(
      settingRows.map((r) => ({
        ...r,
        tab_id: newTab.tab_id,
        updated_by: clientId,
        updated_at: now,
      })),
    )
    if (error) throw new Error(error.message)
  }

  const { data: groups, error: groupsError } = await db
    .from('parcel_groups')
    .select('name, memo, color, style, parcel_ids')
    .eq('tab_id', source.tab_id)
  if (groupsError) throw new Error(groupsError.message)
  const groupRows = (groups ?? []) as Record<string, unknown>[]
  if (groupRows.length > 0) {
    const newIds = genGroupIds(groupRows.length)
    const { error } = await db.from('parcel_groups').insert(
      groupRows.map((r, i) => ({
        ...r,
        group_id: newIds[i],
        tab_id: newTab.tab_id,
        updated_by: clientId,
        updated_at: now,
      })),
    )
    if (error) throw new Error(error.message)
  }

  return { status: 200, body: rowToTab(newTab) }
}
