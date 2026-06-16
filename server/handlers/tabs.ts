import {
  createTabRequestSchema,
  deleteTabRequestSchema,
  updateTabRequestSchema,
} from '../../src/types/api/tabs.js'
import type { Tab } from '../../src/types/api/tabs.js'
import { createDb } from './db.js'
import type { Db } from './db.js'
import { badRequest, conflict, methodNotAllowed, notFound, ok } from './http.js'
import { genTabId } from './ids.js'
import type { Handler } from './types.js'

export interface TabRow {
  tab_id: string
  name: string
  sort_order: number
  closed_at: string | null
  history_deleted_at: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}

export function rowToTab(row: TabRow): Tab {
  return {
    tabId: row.tab_id,
    name: row.name,
    sortOrder: row.sort_order,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }
}

/** 활성 탭 sort_order 최댓값 + 1 (없으면 0) */
export async function nextSortOrder(db: Db): Promise<number> {
  const { data, error } = await db
    .from('tabs')
    .select('sort_order')
    .is('closed_at', null)
    .order('sort_order', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Pick<TabRow, 'sort_order'>[]
  return rows.length > 0 ? rows[0].sort_order + 1 : 0
}

/** GET /api/tabs · POST /api/tabs */
export const tabsCollectionHandler: Handler = async (req, ctx) => {
  if (req.method === 'GET') {
    const db = createDb(ctx.env)
    const { data, error } = await db
      .from('tabs')
      .select('*')
      .is('closed_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    let rows = (data ?? []) as TabRow[]

    // 활성 탭 >= 1 불변식 — 0개면 기본 탭을 자동 생성 (AC-5)
    if (rows.length === 0) {
      const { data: created, error: insertError } = await db
        .from('tabs')
        .insert({ tab_id: genTabId(), name: '기본 작업공간', sort_order: 0 })
        .select('*')
        .single()
      if (insertError) throw new Error(insertError.message)
      rows = [created as TabRow]
    }
    return { status: 200, body: rows.map(rowToTab) }
  }

  if (req.method === 'POST') {
    const parsed = createTabRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const db = createDb(ctx.env)
    const { data, error } = await db
      .from('tabs')
      .insert({
        tab_id: genTabId(),
        name: parsed.data.name ?? '새 작업공간',
        sort_order: await nextSortOrder(db),
        updated_by: parsed.data.clientId,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return { status: 200, body: rowToTab(data as TabRow) }
  }

  return methodNotAllowed()
}

/** PATCH /api/tabs/:id · DELETE /api/tabs/:id */
export const tabItemHandler: Handler = async (req, ctx) => {
  const tabId = req.params.id

  if (req.method === 'PATCH') {
    const parsed = updateTabRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const db = createDb(ctx.env)
    const patch: Record<string, string | number> = {
      updated_by: parsed.data.clientId,
      updated_at: new Date().toISOString(),
    }
    if (parsed.data.name !== undefined) patch.name = parsed.data.name
    if (parsed.data.sortOrder !== undefined) patch.sort_order = parsed.data.sortOrder
    const { data, error } = await db
      .from('tabs')
      .update(patch)
      .eq('tab_id', tabId)
      .is('closed_at', null)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return notFound('활성 탭을 찾을 수 없습니다')
    return { status: 200, body: rowToTab(data as TabRow) }
  }

  if (req.method === 'DELETE') {
    const parsed = deleteTabRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const db = createDb(ctx.env)
    const { data: active, error } = await db.from('tabs').select('tab_id').is('closed_at', null)
    if (error) throw new Error(error.message)
    const activeIds = ((active ?? []) as Pick<TabRow, 'tab_id'>[]).map((r) => r.tab_id)
    if (!activeIds.includes(tabId)) return notFound('활성 탭을 찾을 수 없습니다')
    // 마지막 활성 탭 보호는 서버 책임 (C-2 — 클라 가드에 의존하지 않는다)
    if (activeIds.length <= 1) return conflict('마지막 활성 탭은 닫을 수 없습니다')

    const { error: closeError } = await db
      .from('tabs')
      .update({
        closed_at: new Date().toISOString(),
        updated_by: parsed.data.clientId,
        updated_at: new Date().toISOString(),
      })
      .eq('tab_id', tabId)
      .is('closed_at', null)
    if (closeError) throw new Error(closeError.message)
    return ok()
  }

  return methodNotAllowed()
}
