import {
  createInventoryItemRequestSchema,
  deleteInventoryItemRequestSchema,
  updateInventoryItemRequestSchema,
} from '../../src/types/api/inventoryItems.js'
import type { InventoryItem } from '../../src/types/api/inventoryItems.js'
import { requireUser } from './auth.js'
import { createDb } from './db.js'
import { badRequest, methodNotAllowed, notFound, ok } from './http.js'
import { genInventoryItemId } from './ids.js'
import type { Handler } from './types.js'

interface InventoryItemRow {
  item_id: string
  name: string
  unit: string
  category: string | null
  memo: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

function rowToItem(row: InventoryItemRow): InventoryItem {
  return {
    itemId: row.item_id,
    name: row.name,
    unit: row.unit,
    category: row.category,
    memo: row.memo,
    active: row.active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** trim 후 빈 문자열이면 null (contacts.normText 선례) */
function normText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const t = value.trim()
  return t.length > 0 ? t : null
}

/**
 * GET /api/inventory/items · POST /api/inventory/items (전역 공유 — created_by 필터 없음, 절충 0).
 * GET: 기본 active=true만, ?includeInactive=true면 전량(AC-6). POST: requireUser → 생성(AC-5).
 */
export const inventoryItemsCollectionHandler: Handler = async (req, ctx) => {
  if (req.method === 'GET') {
    const db = createDb(ctx.env)
    let query = db.from('inventory_items').select('*')
    if (req.query.includeInactive !== 'true') query = query.eq('active', true)
    const { data, error } = await query.order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return { status: 200, body: ((data ?? []) as InventoryItemRow[]).map(rowToItem) }
  }

  if (req.method === 'POST') {
    const parsed = createInventoryItemRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)
    const { data, error } = await db
      .from('inventory_items')
      .insert({
        item_id: genInventoryItemId(),
        name: parsed.data.name.trim(),
        unit: parsed.data.unit.trim(),
        category: normText(parsed.data.category),
        memo: normText(parsed.data.memo),
        active: true,
        created_by: auth.user.id,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return { status: 200, body: rowToItem(data as InventoryItemRow) }
  }

  return methodNotAllowed()
}

/**
 * PATCH /api/inventory/items/:id · DELETE /api/inventory/items/:id (requireUser).
 * PATCH: 부분 수정 + active=true 재활성화(AC-7). DELETE: 소프트 비활성(active=false, 절충 4).
 * 품목 마스터 변경은 기존 거래 스냅샷에 소급 안 됨(AC-13 — 스냅샷은 거래 행이 권위).
 */
export const inventoryItemsItemHandler: Handler = async (req, ctx) => {
  const itemId = req.params.id

  if (req.method === 'PATCH') {
    const parsed = updateInventoryItemRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)
    const patch: Record<string, string | boolean | null> = {
      updated_at: new Date().toISOString(),
    }
    if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim()
    if (parsed.data.unit !== undefined) patch.unit = parsed.data.unit.trim()
    if (parsed.data.category !== undefined) patch.category = normText(parsed.data.category)
    if (parsed.data.memo !== undefined) patch.memo = normText(parsed.data.memo)
    if (parsed.data.active !== undefined) patch.active = parsed.data.active
    const { data, error } = await db
      .from('inventory_items')
      .update(patch)
      .eq('item_id', itemId)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return notFound('품목을 찾을 수 없습니다')
    return { status: 200, body: rowToItem(data as InventoryItemRow) }
  }

  if (req.method === 'DELETE') {
    const parsed = deleteInventoryItemRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)
    // 소프트 비활성 — 물리 삭제 금지(거래가 item_id로 참조, 절충 4). 비활성 품목도 현재고 계산엔 참여.
    const { data, error } = await db
      .from('inventory_items')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('item_id', itemId)
      .select('item_id')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return notFound('품목을 찾을 수 없습니다')
    return ok()
  }

  return methodNotAllowed()
}
