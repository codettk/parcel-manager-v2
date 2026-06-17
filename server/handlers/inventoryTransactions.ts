import {
  createInventoryTransactionRequestSchema,
  deleteInventoryTransactionRequestSchema,
} from '../../src/types/api/inventoryTransactions.js'
import type { InventoryTransaction } from '../../src/types/api/inventoryTransactions.js'
import { requireUser } from './auth.js'
import { createDb } from './db.js'
import { badRequest, methodNotAllowed, notFound, ok } from './http.js'
import { genInventoryTxnId } from './ids.js'
import type { Handler } from './types.js'

interface InventoryTransactionRow {
  txn_id: string
  item_id: string
  item_name_snapshot: string
  unit_snapshot: string
  type: 'in' | 'out'
  quantity: number | string
  txn_date: string
  contact_id: string | null
  contact_name_snapshot: string | null
  unit_price: number | null
  amount: number | null
  memo: string | null
  created_by: string | null
  created_at: string
}

function rowToTxn(row: InventoryTransactionRow): InventoryTransaction {
  return {
    txnId: row.txn_id,
    itemId: row.item_id,
    itemNameSnapshot: row.item_name_snapshot,
    unitSnapshot: row.unit_snapshot,
    type: row.type,
    // quantity는 numeric 컬럼이라 드라이버가 문자열로 반환할 수 있어 Number로 정규화
    quantity: Number(row.quantity),
    txnDate: row.txn_date,
    contactId: row.contact_id,
    contactNameSnapshot: row.contact_name_snapshot,
    unitPrice: row.unit_price,
    amount: row.amount,
    memo: row.memo,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

/** trim 후 빈 문자열이면 null (contacts.normText 선례) */
function normText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const t = value.trim()
  return t.length > 0 ? t : null
}

/**
 * GET /api/inventory/transactions · POST /api/inventory/transactions (전역 공유 — created_by 필터 없음, 절충 0).
 * GET: txn_date 내림차순 + ?itemId(품목별 이력)·?from·?to(기간) 필터(AC-10).
 * POST: requireUser → 생성. 서버가 itemId로 품목명·단위를, contactId(있으면)로 거래처 상호를 스냅샷하고
 *       amount = quantity × unitPrice(정수 반올림, unitPrice 없으면 null)를 산출(AC-8·9).
 *       거래처 유형 정합(in↔buy)은 강제하지 않는다(절충 2, AC-9).
 */
export const inventoryTransactionsCollectionHandler: Handler = async (req, ctx) => {
  if (req.method === 'GET') {
    const db = createDb(ctx.env)
    let query = db.from('inventory_transactions').select('*')
    if (req.query.itemId) query = query.eq('item_id', req.query.itemId)
    if (req.query.from) query = query.gte('txn_date', req.query.from)
    if (req.query.to) query = query.lte('txn_date', req.query.to)
    // txn_date 내림차순(최신 우선), 동일 일자는 created_at으로 안정 정렬
    const { data, error } = await query
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return { status: 200, body: ((data ?? []) as InventoryTransactionRow[]).map(rowToTxn) }
  }

  if (req.method === 'POST') {
    const parsed = createInventoryTransactionRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)

    // 품목 마스터에서 현재 이름·단위를 조회해 스냅샷 복사(절충 3). 품목 없으면 404(거래 미생성).
    const { data: itemData, error: itemErr } = await db
      .from('inventory_items')
      .select('name, unit')
      .eq('item_id', parsed.data.itemId)
      .maybeSingle()
    if (itemErr) throw new Error(itemErr.message)
    if (!itemData) return notFound('품목을 찾을 수 없습니다')
    const item = itemData as { name: string; unit: string }

    // 거래처(있으면) 현재 상호를 조회해 스냅샷 복사. 유형 정합(in↔buy)은 검증하지 않음(절충 2).
    let contactId: string | null = null
    let contactNameSnapshot: string | null = null
    if (parsed.data.contactId) {
      const { data: contactData, error: contactErr } = await db
        .from('contacts')
        .select('name')
        .eq('contact_id', parsed.data.contactId)
        .maybeSingle()
      if (contactErr) throw new Error(contactErr.message)
      if (!contactData) return notFound('거래처를 찾을 수 없습니다')
      contactId = parsed.data.contactId
      contactNameSnapshot = (contactData as { name: string }).name
    }

    const unitPrice = parsed.data.unitPrice ?? null
    const amount = unitPrice === null ? null : Math.round(parsed.data.quantity * unitPrice)

    const { data, error } = await db
      .from('inventory_transactions')
      .insert({
        txn_id: genInventoryTxnId(),
        item_id: parsed.data.itemId,
        item_name_snapshot: item.name,
        unit_snapshot: item.unit,
        type: parsed.data.type,
        quantity: parsed.data.quantity,
        txn_date: parsed.data.txnDate,
        contact_id: contactId,
        contact_name_snapshot: contactNameSnapshot,
        unit_price: unitPrice,
        amount,
        memo: normText(parsed.data.memo),
        created_by: auth.user.id,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return { status: 200, body: rowToTxn(data as InventoryTransactionRow) }
  }

  return methodNotAllowed()
}

/**
 * DELETE /api/inventory/transactions/:id (requireUser). 하드 삭제(append-only 원장, PATCH 미제공, 절충 5).
 * 삭제 시 그 품목 현재고는 다음 합산에서 자동 재계산(파생 — 별도 트리거 불요, AC-11).
 */
export const inventoryTransactionsItemHandler: Handler = async (req, ctx) => {
  const txnId = req.params.id

  if (req.method === 'DELETE') {
    const parsed = deleteInventoryTransactionRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)
    const { data, error } = await db
      .from('inventory_transactions')
      .delete()
      .eq('txn_id', txnId)
      .select('txn_id')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return notFound('거래를 찾을 수 없습니다')
    return ok()
  }

  return methodNotAllowed()
}
