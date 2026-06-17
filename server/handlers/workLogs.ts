import { computeLogTotal } from '../../src/utils/workLogCost.js'
import {
  createWorkLogRequestSchema,
  deleteWorkLogRequestSchema,
  updateWorkLogRequestSchema,
} from '../../src/types/api/workLogs.js'
import type { WorkLog, WorkLogWorker, WorkLogWorkerInput } from '../../src/types/api/workLogs.js'
import { requireUser } from './auth.js'
import { createDb } from './db.js'
import type { Db } from './db.js'
import { badRequest, methodNotAllowed, notFound, ok } from './http.js'
import { genWorkLogEntryId, genWorkLogId } from './ids.js'
import type { Handler } from './types.js'

interface WorkLogRow {
  log_id: string
  work_date: string
  title: string
  memo: string | null
  total_cost: number
  created_by: string | null
  created_at: string
  updated_at: string
}

interface WorkerRow {
  entry_id: string
  log_id: string
  staff_id: string | null
  staff_name_snapshot: string
  applied_wage: number
  work_ratio: number
}

function rowToWorker(row: WorkerRow): WorkLogWorker {
  return {
    staffId: row.staff_id ?? '',
    staffNameSnapshot: row.staff_name_snapshot,
    appliedWage: row.applied_wage,
    workRatio: Number(row.work_ratio),
  }
}

function rowToWorkLog(row: WorkLogRow, workers: WorkLogWorker[]): WorkLog {
  return {
    logId: row.log_id,
    workDate: row.work_date,
    title: row.title,
    memo: row.memo,
    workers,
    totalCost: row.total_cost,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 동일 timestamp 배치 삽입에서도 충돌하지 않는 entry_id 목록 생성 (genGroupIds 선례) */
function genEntryIds(count: number): string[] {
  const ids = new Set<string>()
  while (ids.size < count) ids.add(genWorkLogEntryId())
  return [...ids]
}

/**
 * 투입 인력 입력 → 라인 행으로 변환. 각 staffId로 staff 마스터에서 현재 이름을 조회해
 * staff_name_snapshot을 작성 시점 값으로 복사한다(절충 2 — 회계 무결성). applied_wage는 요청값을 그대로 저장.
 * staff가 없으면(삭제·오타) 스냅샷 이름은 빈 문자열로 둔다(라인 자체는 유지 — 스냅샷이 권위).
 */
async function buildWorkerRows(
  db: Db,
  logId: string,
  workers: WorkLogWorkerInput[],
): Promise<WorkerRow[]> {
  const staffIds = [...new Set(workers.map((w) => w.staffId))]
  const nameById = new Map<string, string>()
  if (staffIds.length > 0) {
    const { data, error } = await db.from('staff').select('staff_id, name').in('staff_id', staffIds)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as { staff_id: string; name: string }[]) {
      nameById.set(r.staff_id, r.name)
    }
  }
  const entryIds = genEntryIds(workers.length)
  return workers.map((w, i) => ({
    entry_id: entryIds[i],
    log_id: logId,
    staff_id: w.staffId,
    staff_name_snapshot: nameById.get(w.staffId) ?? '',
    applied_wage: w.appliedWage,
    work_ratio: w.workRatio,
  }))
}

/** 한 일지의 라인을 조회해 정렬된 WorkLogWorker[]로 조립 (created_at·entry_id 안정 정렬) */
async function loadWorkers(db: Db, logId: string): Promise<WorkLogWorker[]> {
  const { data, error } = await db
    .from('work_log_workers')
    .select('*')
    .eq('log_id', logId)
    .order('created_at', { ascending: true })
    .order('entry_id', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as WorkerRow[]).map(rowToWorker)
}

/**
 * GET /api/work-logs · POST /api/work-logs (전역 공유 — created_by 필터 없음, 절충 0).
 * GET: work_date 내림차순 + 라인 조인 + totalCost, ?from·?to 기간 필터(AC-6).
 * POST: requireUser → 생성, 라인 스냅샷·total_cost 서버 계산(AC-5·9).
 */
export const workLogsCollectionHandler: Handler = async (req, ctx) => {
  if (req.method === 'GET') {
    const db = createDb(ctx.env)
    let query = db.from('work_logs').select('*')
    if (req.query.from) query = query.gte('work_date', req.query.from)
    if (req.query.to) query = query.lte('work_date', req.query.to)
    // work_date 내림차순(최신 우선), 동일 날짜는 created_at으로 안정 정렬
    const { data, error } = await query
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as WorkLogRow[]
    const logs = await Promise.all(
      rows.map(async (row) => rowToWorkLog(row, await loadWorkers(db, row.log_id))),
    )
    return { status: 200, body: logs }
  }

  if (req.method === 'POST') {
    const parsed = createWorkLogRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)

    const logId = genWorkLogId()
    const workerRows = await buildWorkerRows(db, logId, parsed.data.workers)
    const totalCost = computeLogTotal(
      workerRows.map((r) => ({ appliedWage: r.applied_wage, workRatio: r.work_ratio })),
    )

    const { data: logData, error: logError } = await db
      .from('work_logs')
      .insert({
        log_id: logId,
        work_date: parsed.data.workDate,
        title: parsed.data.title.trim(),
        memo: normMemo(parsed.data.memo),
        total_cost: totalCost,
        created_by: auth.user.id,
      })
      .select('*')
      .single()
    if (logError) throw new Error(logError.message)

    if (workerRows.length > 0) {
      const { error: workerError } = await db.from('work_log_workers').insert(workerRows)
      if (workerError) throw new Error(workerError.message)
    }

    return {
      status: 200,
      body: rowToWorkLog(logData as WorkLogRow, workerRows.map(rowToWorker)),
    }
  }

  return methodNotAllowed()
}

/**
 * PATCH /api/work-logs/:id · DELETE /api/work-logs/:id (requireUser).
 * PATCH: 헤더 갱신 + workers 지정 시 라인 전체 치환(기존 삭제 후 재insert, 스냅샷·total_cost 재계산, AC-7).
 * DELETE: 하드 삭제(work_logs 삭제 → work_log_workers CASCADE, AC-8).
 */
export const workLogItemHandler: Handler = async (req, ctx) => {
  const logId = req.params.id

  if (req.method === 'PATCH') {
    const parsed = updateWorkLogRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)

    // 대상 존재 확인 — 없으면 404 (어떤 라인도 건드리지 않음)
    const { data: existing, error: existErr } = await db
      .from('work_logs')
      .select('log_id')
      .eq('log_id', logId)
      .maybeSingle()
    if (existErr) throw new Error(existErr.message)
    if (!existing) return notFound('업무일지를 찾을 수 없습니다')

    // 라인 전체 치환(지정 시) — 기존 라인 삭제 후 신규 스냅샷 재insert
    let workers: WorkLogWorker[] | null = null
    let totalCost: number | null = null
    if (parsed.data.workers !== undefined) {
      const { error: delErr } = await db.from('work_log_workers').delete().eq('log_id', logId)
      if (delErr) throw new Error(delErr.message)
      const workerRows = await buildWorkerRows(db, logId, parsed.data.workers)
      if (workerRows.length > 0) {
        const { error: insErr } = await db.from('work_log_workers').insert(workerRows)
        if (insErr) throw new Error(insErr.message)
      }
      workers = workerRows.map(rowToWorker)
      totalCost = computeLogTotal(
        workerRows.map((r) => ({ appliedWage: r.applied_wage, workRatio: r.work_ratio })),
      )
    }

    const patch: Record<string, string | number | null> = {
      updated_at: new Date().toISOString(),
    }
    if (parsed.data.workDate !== undefined) patch.work_date = parsed.data.workDate
    if (parsed.data.title !== undefined) patch.title = parsed.data.title.trim()
    if (parsed.data.memo !== undefined) patch.memo = normMemo(parsed.data.memo)
    if (totalCost !== null) patch.total_cost = totalCost

    const { data, error } = await db
      .from('work_logs')
      .update(patch)
      .eq('log_id', logId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)

    // workers를 치환하지 않았으면 기존 라인을 다시 조회해 응답에 포함
    const finalWorkers = workers ?? (await loadWorkers(db, logId))
    return { status: 200, body: rowToWorkLog(data as WorkLogRow, finalWorkers) }
  }

  if (req.method === 'DELETE') {
    const parsed = deleteWorkLogRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const auth = await requireUser(ctx)
    if ('response' in auth) return auth.response
    const db = createDb(ctx.env)
    // 하드 삭제 — work_log_workers는 ON DELETE CASCADE로 동반 삭제(절충 6)
    const { data, error } = await db
      .from('work_logs')
      .delete()
      .eq('log_id', logId)
      .select('log_id')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return notFound('업무일지를 찾을 수 없습니다')
    return ok()
  }

  return methodNotAllowed()
}

/** trim 후 빈 문자열이면 null (staff.normText 선례) */
function normMemo(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const t = value.trim()
  return t.length > 0 ? t : null
}
