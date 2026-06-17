import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { staffCollectionHandler, staffItemHandler } from '../../server/handlers/staff'
import { workLogItemHandler, workLogsCollectionHandler } from '../../server/handlers/workLogs'
import { errorResponseSchema, okResponseSchema } from '../../src/types/api/common'
import { staffSchema } from '../../src/types/api/staff'
import { workLogListResponseSchema, workLogSchema } from '../../src/types/api/workLogs'
import { computeLogTotal } from '../../src/utils/workLogCost'
import { call, CLIENT_ID, db, getTestToken, issueFreshToken, TEST_USER_ID } from './helpers'

const noAuthCtx = { env: process.env, auth: { token: null } }

/** 테스트가 만든 업무일지·인력 행을 모두 물리 삭제(전역 공유 — 잔여가 다른 테스트를 오염시키므로) */
async function purge(): Promise<void> {
  // work_logs 삭제 시 work_log_workers는 CASCADE로 함께 삭제됨
  const { error: logErr } = await db.from('work_logs').delete().neq('log_id', '')
  if (logErr) throw new Error(logErr.message)
  const { error: staffErr } = await db.from('staff').delete().neq('staff_id', '')
  if (staffErr) throw new Error(staffErr.message)
}

/** 활성 인력 1명 생성 (Given 구성용) */
async function createStaff(name: string, dailyWage: number): Promise<string> {
  const res = await call(staffCollectionHandler, 'POST', {}, { name, dailyWage, clientId: CLIENT_ID })
  return staffSchema.parse(res.body).staffId
}

async function listLogs(token: string, query: Record<string, string | undefined> = {}) {
  const res = await workLogsCollectionHandler(
    { method: 'GET', params: {}, query, body: undefined },
    { env: process.env, auth: { token } },
  )
  expect(res.status).toBe(200)
  return workLogListResponseSchema.parse(res.body)
}

beforeEach(purge)
afterAll(purge)

describe('AC-5: POST /api/work-logs — 생성 (라인 스냅샷·total_cost·created_by 자동)', () => {
  it('일지를 생성하면 logId 부여·라인 스냅샷·total_cost가 computeLogTotal과 일치', async () => {
    await getTestToken() // TEST_USER_ID 채움
    const kim = await createStaff('김일꾼', 80000)
    const lee = await createStaff('이일꾼', 60000)

    const res = await call(
      workLogsCollectionHandler,
      'POST',
      {},
      {
        workDate: '2026-06-18',
        title: '  고추밭 정식  ',
        memo: '오전 작업',
        workers: [
          { staffId: kim, appliedWage: 80000, workRatio: 1.0 },
          { staffId: lee, appliedWage: 60000, workRatio: 0.5 },
        ],
        clientId: CLIENT_ID,
      },
    )
    expect(res.status).toBe(200)
    const log = workLogSchema.parse(res.body)
    expect(log.logId).toMatch(/^wlg_/)
    expect(log.title).toBe('고추밭 정식') // trim
    expect(log.createdBy).toBe(TEST_USER_ID)
    expect(log.workers).toHaveLength(2)
    // 스냅샷 이름이 마스터에서 채워짐
    const byStaff = new Map(log.workers.map((w) => [w.staffId, w]))
    expect(byStaff.get(kim)?.staffNameSnapshot).toBe('김일꾼')
    expect(byStaff.get(lee)?.staffNameSnapshot).toBe('이일꾼')
    // total_cost = 80000*1.0 + 60000*0.5 = 110000
    expect(log.totalCost).toBe(110000)
    expect(log.totalCost).toBe(
      computeLogTotal(log.workers.map((w) => ({ appliedWage: w.appliedWage, workRatio: w.workRatio }))),
    )
  })

  it('투입 인력 0명이면 total_cost=0', async () => {
    const res = await call(
      workLogsCollectionHandler,
      'POST',
      {},
      { workDate: '2026-06-18', title: '미배정', workers: [], clientId: CLIENT_ID },
    )
    const log = workLogSchema.parse(res.body)
    expect(log.workers).toHaveLength(0)
    expect(log.totalCost).toBe(0)
    expect(log.memo).toBeNull()
  })
})

describe('AC-6: GET /api/work-logs — 날짜 내림차순 + 기간 필터', () => {
  it('work_date 내림차순으로 반환하고 ?from·?to로 기간 필터된다', async () => {
    const staff = await createStaff('일꾼', 70000)
    const mk = (workDate: string, title: string) =>
      call(
        workLogsCollectionHandler,
        'POST',
        {},
        {
          workDate,
          title,
          workers: [{ staffId: staff, appliedWage: 70000, workRatio: 1.0 }],
          clientId: CLIENT_ID,
        },
      )
    await mk('2026-05-15', '5월작업')
    await mk('2026-06-20', '6월작업')
    await mk('2026-07-02', '7월작업')

    const token = await getTestToken()
    const all = await listLogs(token)
    expect(all.map((l) => l.workDate)).toEqual(['2026-07-02', '2026-06-20', '2026-05-15'])
    // 각 일지에 라인·totalCost 포함
    expect(all[0].workers).toHaveLength(1)
    expect(all[0].totalCost).toBe(70000)

    const june = await listLogs(token, { from: '2026-06-01', to: '2026-06-30' })
    expect(june.map((l) => l.title)).toEqual(['6월작업'])
  })
})

describe('AC-7: PATCH /api/work-logs/:id — 헤더 갱신 + 라인 전체 치환', () => {
  it('제목 갱신 + 라인 2개 → 1개 전체 치환, total_cost 재산출·updatedAt 갱신', async () => {
    const a = await createStaff('A', 80000)
    const b = await createStaff('B', 60000)
    const created = workLogSchema.parse(
      (
        await call(
          workLogsCollectionHandler,
          'POST',
          {},
          {
            workDate: '2026-06-18',
            title: '수정전',
            workers: [
              { staffId: a, appliedWage: 80000, workRatio: 1.0 },
              { staffId: b, appliedWage: 60000, workRatio: 1.0 },
            ],
            clientId: CLIENT_ID,
          },
        )
      ).body,
    )
    expect(created.totalCost).toBe(140000)

    const res = await call(
      workLogItemHandler,
      'PATCH',
      { id: created.logId },
      {
        title: '수정후',
        workers: [{ staffId: a, appliedWage: 80000, workRatio: 0.5 }],
        clientId: CLIENT_ID,
      },
    )
    expect(res.status).toBe(200)
    const updated = workLogSchema.parse(res.body)
    expect(updated.title).toBe('수정후')
    expect(updated.workers).toHaveLength(1) // 전체 치환(2→1)
    expect(updated.workers[0].staffId).toBe(a)
    expect(updated.totalCost).toBe(40000) // 80000*0.5
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.createdAt).getTime(),
    )

    // DB에 라인이 실제로 1개만 남았는지 확인(기존 2개 삭제 후 신규 insert)
    const { count } = await db
      .from('work_log_workers')
      .select('entry_id', { count: 'exact', head: true })
      .eq('log_id', created.logId)
    expect(count).toBe(1)
  })

  it('workers 미지정 PATCH는 헤더만 갱신하고 기존 라인을 보존한다', async () => {
    const a = await createStaff('A', 80000)
    const created = workLogSchema.parse(
      (
        await call(
          workLogsCollectionHandler,
          'POST',
          {},
          {
            workDate: '2026-06-18',
            title: 'memo만',
            workers: [{ staffId: a, appliedWage: 80000, workRatio: 1.0 }],
            clientId: CLIENT_ID,
          },
        )
      ).body,
    )
    const res = await call(
      workLogItemHandler,
      'PATCH',
      { id: created.logId },
      { memo: '추가메모', clientId: CLIENT_ID },
    )
    const updated = workLogSchema.parse(res.body)
    expect(updated.memo).toBe('추가메모')
    expect(updated.workers).toHaveLength(1) // 보존
    expect(updated.totalCost).toBe(80000) // 불변
  })

  it('존재하지 않는 id PATCH는 404', async () => {
    const res = await call(workLogItemHandler, 'PATCH', { id: 'wlg_nope' }, { title: 'x', clientId: CLIENT_ID })
    expect(res.status).toBe(404)
    errorResponseSchema.parse(res.body)
  })
})

describe('AC-8: DELETE /api/work-logs/:id — 하드 삭제 + CASCADE', () => {
  it('헤더 행 물리 삭제 + work_log_workers 라인 CASCADE 동반 삭제', async () => {
    const a = await createStaff('A', 80000)
    const created = workLogSchema.parse(
      (
        await call(
          workLogsCollectionHandler,
          'POST',
          {},
          {
            workDate: '2026-06-18',
            title: '삭제대상',
            workers: [{ staffId: a, appliedWage: 80000, workRatio: 1.0 }],
            clientId: CLIENT_ID,
          },
        )
      ).body,
    )

    const del = await call(workLogItemHandler, 'DELETE', { id: created.logId }, { clientId: CLIENT_ID })
    expect(del.status).toBe(200)
    okResponseSchema.parse(del.body)

    // 헤더 물리 삭제 확인
    const { data: logRow } = await db.from('work_logs').select('log_id').eq('log_id', created.logId).maybeSingle()
    expect(logRow).toBeNull()
    // 라인 CASCADE 삭제 확인
    const { count } = await db
      .from('work_log_workers')
      .select('entry_id', { count: 'exact', head: true })
      .eq('log_id', created.logId)
    expect(count).toBe(0)

    const token = await getTestToken()
    const list = await listLogs(token)
    expect(list.map((l) => l.logId)).not.toContain(created.logId)
  })

  it('존재하지 않는 id DELETE는 404', async () => {
    const res = await call(workLogItemHandler, 'DELETE', { id: 'wlg_nope' }, { clientId: CLIENT_ID })
    expect(res.status).toBe(404)
  })
})

describe('AC-9: 무인증 mutate는 401 (행 미기록/미변경)', () => {
  it('무토큰 POST는 401이고 행이 생성되지 않는다', async () => {
    const { count: before } = await db.from('work_logs').select('log_id', { count: 'exact', head: true })
    const res = await workLogsCollectionHandler(
      {
        method: 'POST',
        params: {},
        query: {},
        body: { workDate: '2026-06-18', title: '무인증', workers: [], clientId: CLIENT_ID },
      },
      noAuthCtx,
    )
    expect(res.status).toBe(401)
    errorResponseSchema.parse(res.body)
    const { count: after } = await db.from('work_logs').select('log_id', { count: 'exact', head: true })
    expect(after).toBe(before)
  })

  it('무토큰 PATCH·DELETE는 401이고 변경되지 않는다', async () => {
    const created = workLogSchema.parse(
      (
        await call(
          workLogsCollectionHandler,
          'POST',
          {},
          { workDate: '2026-06-18', title: '게이트', workers: [], clientId: CLIENT_ID },
        )
      ).body,
    )
    const patchRes = await workLogItemHandler(
      { method: 'PATCH', params: { id: created.logId }, query: {}, body: { title: 'x', clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(patchRes.status).toBe(401)
    const delRes = await workLogItemHandler(
      { method: 'DELETE', params: { id: created.logId }, query: {}, body: { clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(delRes.status).toBe(401)
    // 변경되지 않았는지 확인
    const { data } = await db.from('work_logs').select('title').eq('log_id', created.logId).maybeSingle()
    expect((data as { title: string }).title).toBe('게이트')
  })
})

describe('AC-10: 일당 스냅샷 — 마스터 dailyWage 변경이 과거 일지에 소급 안 됨', () => {
  it('생성 후 staff dailyWage를 변경해도 일지 appliedWage·totalCost 불변', async () => {
    const a = await createStaff('단가일꾼', 80000)
    const created = workLogSchema.parse(
      (
        await call(
          workLogsCollectionHandler,
          'POST',
          {},
          {
            workDate: '2026-06-18',
            title: '스냅샷',
            workers: [{ staffId: a, appliedWage: 80000, workRatio: 1.0 }],
            clientId: CLIENT_ID,
          },
        )
      ).body,
    )
    expect(created.totalCost).toBe(80000)

    // 마스터 일당 인상
    await call(staffItemHandler, 'PATCH', { id: a }, { dailyWage: 100000, clientId: CLIENT_ID })

    const token = await getTestToken()
    const list = await listLogs(token)
    const fetched = list.find((l) => l.logId === created.logId)
    expect(fetched?.workers[0].appliedWage).toBe(80000) // 소급 안 됨
    expect(fetched?.totalCost).toBe(80000) // 불변
  })
})

describe('AC-11: 비활성 인력 스냅샷 무결', () => {
  it('staff 소프트 비활성 후에도 일지 라인이 스냅샷으로 그대로 조회된다', async () => {
    const a = await createStaff('퇴사일꾼', 90000)
    const created = workLogSchema.parse(
      (
        await call(
          workLogsCollectionHandler,
          'POST',
          {},
          {
            workDate: '2026-06-18',
            title: '비활성보존',
            workers: [{ staffId: a, appliedWage: 90000, workRatio: 1.0 }],
            clientId: CLIENT_ID,
          },
        )
      ).body,
    )

    // 소프트 비활성(staff DELETE = active=false)
    const del = await call(staffItemHandler, 'DELETE', { id: a }, { clientId: CLIENT_ID })
    expect(del.status).toBe(200)

    const token = await getTestToken()
    const list = await listLogs(token)
    const fetched = list.find((l) => l.logId === created.logId)
    expect(fetched?.workers).toHaveLength(1)
    expect(fetched?.workers[0].staffNameSnapshot).toBe('퇴사일꾼') // 스냅샷 보존
    expect(fetched?.workers[0].appliedWage).toBe(90000)
    expect(fetched?.totalCost).toBe(90000)
  })
})

describe('AC-12: 전역 공유 — 다른 세션 토큰으로도 같은 목록이 보인다', () => {
  it('A가 만든 일지가 새 세션 토큰 조회에도 그대로 보인다(created_by 격리 없음)', async () => {
    const created = workLogSchema.parse(
      (
        await call(
          workLogsCollectionHandler,
          'POST',
          {},
          { workDate: '2026-06-18', title: '공유일지', workers: [], clientId: CLIENT_ID },
        )
      ).body,
    )
    const token2 = await issueFreshToken()
    const list = await listLogs(token2)
    expect(list.map((l) => l.logId)).toContain(created.logId)
  })
})
