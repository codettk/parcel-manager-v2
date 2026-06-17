import {
  createStaffRequestSchema,
  deleteStaffRequestSchema,
  updateStaffRequestSchema,
} from '../../src/types/api/staff.js'
import type { Staff } from '../../src/types/api/staff.js'
import { requireUser } from './auth.js'
import { createDb } from './db.js'
import { badRequest, methodNotAllowed, notFound, ok } from './http.js'
import { genStaffId } from './ids.js'
import type { Handler } from './types.js'

interface StaffRow {
  staff_id: string
  name: string
  phone: string | null
  role: string | null
  daily_wage: number | null
  memo: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

function rowToStaff(row: StaffRow): Staff {
  return {
    staffId: row.staff_id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    dailyWage: row.daily_wage,
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
 * GET /api/staff · POST /api/staff (전역 공유 — created_by 필터 없음, 절충 1).
 * GET: 기본 active=true만, ?includeInactive=true면 전량(AC-2). POST: requireUser → 생성(AC-1).
 */
export const staffCollectionHandler: Handler = async (req, ctx) => {
  if (req.method === 'GET') {
    const db = createDb(ctx.env)
    let query = db.from('staff').select('*')
    if (req.query.includeInactive !== 'true') query = query.eq('active', true)
    const { data, error } = await query.order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return { status: 200, body: ((data ?? []) as StaffRow[]).map(rowToStaff) }
  }

  if (req.method === 'POST') {
    const parsed = createStaffRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)
    const { data, error } = await db
      .from('staff')
      .insert({
        staff_id: genStaffId(),
        name: parsed.data.name.trim(),
        phone: normText(parsed.data.phone),
        role: normText(parsed.data.role),
        daily_wage: parsed.data.dailyWage ?? null,
        memo: normText(parsed.data.memo),
        active: true,
        created_by: auth.user.id,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return { status: 200, body: rowToStaff(data as StaffRow) }
  }

  return methodNotAllowed()
}

/**
 * PATCH /api/staff/:id · DELETE /api/staff/:id (requireUser).
 * PATCH: 부분 수정 + active=true 재활성화(AC-3·9). DELETE: 소프트 비활성 active=false(AC-4).
 */
export const staffItemHandler: Handler = async (req, ctx) => {
  const staffId = req.params.id

  if (req.method === 'PATCH') {
    const parsed = updateStaffRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)
    const patch: Record<string, string | number | boolean | null> = {
      updated_at: new Date().toISOString(),
    }
    if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim()
    if (parsed.data.phone !== undefined) patch.phone = normText(parsed.data.phone)
    if (parsed.data.role !== undefined) patch.role = normText(parsed.data.role)
    if (parsed.data.dailyWage !== undefined) patch.daily_wage = parsed.data.dailyWage
    if (parsed.data.memo !== undefined) patch.memo = normText(parsed.data.memo)
    if (parsed.data.active !== undefined) patch.active = parsed.data.active
    const { data, error } = await db
      .from('staff')
      .update(patch)
      .eq('staff_id', staffId)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return notFound('인력을 찾을 수 없습니다')
    return { status: 200, body: rowToStaff(data as StaffRow) }
  }

  if (req.method === 'DELETE') {
    const parsed = deleteStaffRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)
    // 소프트 비활성 — 물리 삭제 금지(5b 외래 참조 보존, 절충 4)
    const { data, error } = await db
      .from('staff')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('staff_id', staffId)
      .select('staff_id')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return notFound('인력을 찾을 수 없습니다')
    return ok()
  }

  return methodNotAllowed()
}
