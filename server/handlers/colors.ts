import { deleteColorRequestSchema, putColorsRequestSchema } from '../../src/types/api/colors'
import type { ColorLabel } from '../../src/types/api/colors'
import { createDb } from './db'
import { badRequest, methodNotAllowed, notFound, ok } from './http'
import type { Handler } from './types'

interface ColorRow {
  color_id: string
  label: string
  hex: string
  sort_order: number | null
}

function rowToColor(row: ColorRow): ColorLabel {
  return {
    colorId: row.color_id,
    label: row.label,
    hex: row.hex,
    sortOrder: row.sort_order ?? 0,
  }
}

/** GET /api/colors · PUT /api/colors */
export const colorsCollectionHandler: Handler = async (req, ctx) => {
  if (req.method === 'GET') {
    const db = createDb(ctx.env)
    const { data, error } = await db
      .from('color_labels')
      .select('color_id, label, hex, sort_order')
      .order('sort_order', { ascending: true })
      .order('color_id', { ascending: true })
    if (error) throw new Error(error.message)
    return { status: 200, body: ((data ?? []) as ColorRow[]).map(rowToColor) }
  }

  if (req.method === 'PUT') {
    const parsed = putColorsRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const db = createDb(ctx.env)
    if (parsed.data.colors.length > 0) {
      const now = new Date().toISOString()
      const { error } = await db.from('color_labels').upsert(
        parsed.data.colors.map((c) => ({
          color_id: c.colorId,
          label: c.label,
          hex: c.hex,
          sort_order: c.sortOrder,
          updated_by: parsed.data.clientId,
          updated_at: now,
        })),
        { onConflict: 'color_id' },
      )
      if (error) throw new Error(error.message)
    }
    return ok()
  }

  return methodNotAllowed()
}

/** DELETE /api/colors/:id — 삭제 + 전 탭 settings/groups의 color 참조 null 처리 (서버 책임, AC-11) */
export const colorItemHandler: Handler = async (req, ctx) => {
  if (req.method !== 'DELETE') return methodNotAllowed()
  const parsed = deleteColorRequestSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(parsed.error)
  const colorId = req.params.id
  const { clientId } = parsed.data
  const db = createDb(ctx.env)

  const { data: existing, error: findError } = await db
    .from('color_labels')
    .select('color_id')
    .eq('color_id', colorId)
    .maybeSingle()
  if (findError) throw new Error(findError.message)
  if (!existing) return notFound('팔레트 색을 찾을 수 없습니다')

  // Realtime DELETE 이벤트 payload에는 updated_by가 없으므로, 삭제 직전 UPDATE로
  // 누가 지웠는지를 기록해 에코 가드(AC-12)가 가능하게 한다.
  const { error: markError } = await db
    .from('color_labels')
    .update({ updated_by: clientId, updated_at: new Date().toISOString() })
    .eq('color_id', colorId)
  if (markError) throw new Error(markError.message)

  const { error: deleteError } = await db.from('color_labels').delete().eq('color_id', colorId)
  if (deleteError) throw new Error(deleteError.message)

  const now = new Date().toISOString()
  // 색 없는 style은 의미가 없으므로 settings는 style도 함께 비운다 (v1 정규화 보존)
  const { error: settingsError } = await db
    .from('parcel_settings')
    .update({ color: null, style: null, updated_by: clientId, updated_at: now })
    .eq('color', colorId)
  if (settingsError) throw new Error(settingsError.message)
  const { error: groupsError } = await db
    .from('parcel_groups')
    .update({ color: null, updated_by: clientId, updated_at: now })
    .eq('color', colorId)
  if (groupsError) throw new Error(groupsError.message)

  return ok()
}
