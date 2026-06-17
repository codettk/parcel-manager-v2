import {
  createContactRequestSchema,
  deleteContactRequestSchema,
  updateContactRequestSchema,
} from '../../src/types/api/contacts.js'
import type { Contact, ContactKind } from '../../src/types/api/contacts.js'
import { requireUser } from './auth.js'
import { createDb } from './db.js'
import { badRequest, methodNotAllowed, notFound, ok } from './http.js'
import { genContactId } from './ids.js'
import type { Handler } from './types.js'

interface ContactRow {
  contact_id: string
  name: string
  manager: string | null
  phone: string | null
  kind: ContactKind
  memo: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

function rowToContact(row: ContactRow): Contact {
  return {
    contactId: row.contact_id,
    name: row.name,
    manager: row.manager,
    phone: row.phone,
    kind: row.kind,
    memo: row.memo,
    active: row.active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** trim 후 빈 문자열이면 null (GroupSheet.handleSave 정규화 선례) */
function normText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const t = value.trim()
  return t.length > 0 ? t : null
}

/**
 * GET /api/contacts · POST /api/contacts (전역 공유 — created_by 필터 없음, 절충 1).
 * GET: 기본 active=true만, ?includeInactive=true면 전량(AC-8). POST: requireUser → 생성(AC-6).
 * 잘못된 kind는 zod enum이 400(AC-7).
 */
export const contactsCollectionHandler: Handler = async (req, ctx) => {
  if (req.method === 'GET') {
    const db = createDb(ctx.env)
    let query = db.from('contacts').select('*')
    if (req.query.includeInactive !== 'true') query = query.eq('active', true)
    const { data, error } = await query.order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return { status: 200, body: ((data ?? []) as ContactRow[]).map(rowToContact) }
  }

  if (req.method === 'POST') {
    const parsed = createContactRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)
    const { data, error } = await db
      .from('contacts')
      .insert({
        contact_id: genContactId(),
        name: parsed.data.name.trim(),
        manager: normText(parsed.data.manager),
        phone: normText(parsed.data.phone),
        kind: parsed.data.kind,
        memo: normText(parsed.data.memo),
        active: true,
        created_by: auth.user.id,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return { status: 200, body: rowToContact(data as ContactRow) }
  }

  return methodNotAllowed()
}

/**
 * PATCH /api/contacts/:id · DELETE /api/contacts/:id (requireUser).
 * PATCH: 부분 수정 + active=true 재활성화(AC-9, 잘못된 kind 400 AC-7). DELETE: 소프트 비활성(절충 4).
 */
export const contactsItemHandler: Handler = async (req, ctx) => {
  const contactId = req.params.id

  if (req.method === 'PATCH') {
    const parsed = updateContactRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)
    const patch: Record<string, string | boolean | null> = {
      updated_at: new Date().toISOString(),
    }
    if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim()
    if (parsed.data.manager !== undefined) patch.manager = normText(parsed.data.manager)
    if (parsed.data.phone !== undefined) patch.phone = normText(parsed.data.phone)
    if (parsed.data.kind !== undefined) patch.kind = parsed.data.kind
    if (parsed.data.memo !== undefined) patch.memo = normText(parsed.data.memo)
    if (parsed.data.active !== undefined) patch.active = parsed.data.active
    const { data, error } = await db
      .from('contacts')
      .update(patch)
      .eq('contact_id', contactId)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return notFound('거래처를 찾을 수 없습니다')
    return { status: 200, body: rowToContact(data as ContactRow) }
  }

  if (req.method === 'DELETE') {
    const parsed = deleteContactRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)
    // 소프트 비활성 — 물리 삭제 금지(5c 외래 참조 보존, 절충 4)
    const { data, error } = await db
      .from('contacts')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('contact_id', contactId)
      .select('contact_id')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return notFound('거래처를 찾을 수 없습니다')
    return ok()
  }

  return methodNotAllowed()
}
