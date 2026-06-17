import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../src/lib/api'
import { useWorkLogStore } from '../../../src/stores/worklog'
import type { WorkLog } from '../../../src/types/api/workLogs'

// 명세: docs/specs/erp-worklog.md — 업무일지 낙관적 CRUD (AC-15 프론트분). 전역 공유 + 롤백 없음.
vi.mock('../../../src/lib/api', () => ({
  api: {
    workLogs: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}))

const NOW = '2026-06-18T00:00:00.000Z'
const nameById = () => '김씨'

function makeLog(logId: string, workDate: string, title = '작업'): WorkLog {
  return {
    logId,
    workDate,
    title,
    memo: null,
    workers: [{ staffId: 's1', staffNameSnapshot: '김씨', appliedWage: 80000, workRatio: 1 }],
    totalCost: 80000,
    createdBy: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

const workLogsApi = vi.mocked(api.workLogs)

beforeEach(() => {
  useWorkLogStore.setState(useWorkLogStore.getInitialState(), true)
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('worklog store — 로드/정렬', () => {
  it('loadWorkLogs는 기간 필터를 전달하고 work_date 내림차순으로 저장한다', async () => {
    workLogsApi.list.mockResolvedValue([makeLog('l1', '2026-06-01'), makeLog('l2', '2026-06-10')])

    await useWorkLogStore.getState().loadWorkLogs({ from: '2026-06-01', to: '2026-06-30' })

    expect(workLogsApi.list).toHaveBeenCalledWith({ from: '2026-06-01', to: '2026-06-30' })
    const logs = useWorkLogStore.getState().workLogs
    expect(logs.map((l) => l.logId)).toEqual(['l2', 'l1']) // 최신 우선
    expect(useWorkLogStore.getState().range).toEqual({ from: '2026-06-01', to: '2026-06-30' })
  })
})

describe('worklog store — 생성(낙관)', () => {
  it('임시 행을 즉시 추가하고 합계를 산출한 뒤 서버 응답으로 교체한다', async () => {
    const saved = makeLog('l-real', '2026-06-18')
    let resolveCreate: (v: WorkLog) => void = () => {}
    workLogsApi.create.mockReturnValue(
      new Promise<WorkLog>((resolve) => {
        resolveCreate = resolve
      }),
    )

    const p = useWorkLogStore.getState().createWorkLog(
      {
        workDate: '2026-06-18',
        title: '고추밭 정식',
        workers: [
          { staffId: 's1', appliedWage: 80000, workRatio: 1 },
          { staffId: 's2', appliedWage: 60000, workRatio: 0.5 },
        ],
      },
      nameById,
    )

    // 서버 응답 전에도 목록에 즉시 나타난다 (AC-15 낙관)
    const optimistic = useWorkLogStore.getState().workLogs
    expect(optimistic).toHaveLength(1)
    expect(optimistic[0].title).toBe('고추밭 정식')
    expect(optimistic[0].totalCost).toBe(80000 + 30000) // computeLogTotal 동형
    expect(optimistic[0].workers[0].staffNameSnapshot).toBe('김씨') // 끌어온 스냅샷 이름
    expect(optimistic[0].logId).not.toBe('l-real')

    resolveCreate(saved)
    await p
    expect(useWorkLogStore.getState().workLogs).toEqual([saved])
  })

  it('생성 실패 시 낙관 추가를 유지한다 (롤백 없음)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    workLogsApi.create.mockRejectedValue(new Error('boom'))

    await useWorkLogStore
      .getState()
      .createWorkLog({ workDate: '2026-06-18', title: '실패', workers: [] }, nameById)

    expect(useWorkLogStore.getState().workLogs).toHaveLength(1)
    expect(useWorkLogStore.getState().workLogs[0].title).toBe('실패')
  })
})

describe('worklog store — 수정(낙관, 라인 전체 치환)', () => {
  it('헤더 갱신 + 라인 치환 후 합계를 재산출하고 서버 응답으로 교체한다', async () => {
    useWorkLogStore.setState({ workLogs: [makeLog('l1', '2026-06-18', '구제목')] })
    const saved = { ...makeLog('l1', '2026-06-18', '새제목'), totalCost: 40000 }
    workLogsApi.update.mockResolvedValue(saved)

    const p = useWorkLogStore
      .getState()
      .updateWorkLog(
        'l1',
        { title: '새제목', workers: [{ staffId: 's3', appliedWage: 80000, workRatio: 0.5 }] },
        nameById,
      )

    // 낙관 — 응답 전 즉시 반영(라인 전체 치환 + 합계 재산출)
    const before = useWorkLogStore.getState().workLogs[0]
    expect(before.title).toBe('새제목')
    expect(before.workers).toHaveLength(1)
    expect(before.workers[0].staffId).toBe('s3')
    expect(before.totalCost).toBe(40000)

    await p
    expect(useWorkLogStore.getState().workLogs[0]).toEqual(saved)
    expect(workLogsApi.update).toHaveBeenCalledWith('l1', {
      title: '새제목',
      workers: [{ staffId: 's3', appliedWage: 80000, workRatio: 0.5 }],
    })
  })
})

describe('worklog store — 하드 삭제(낙관)', () => {
  it('즉시 목록에서 제거하고 DELETE한다 (롤백 없음)', async () => {
    useWorkLogStore.setState({
      workLogs: [makeLog('l1', '2026-06-18'), makeLog('l2', '2026-06-10')],
    })
    workLogsApi.remove.mockResolvedValue({ ok: true })

    const p = useWorkLogStore.getState().deleteWorkLog('l1')

    expect(useWorkLogStore.getState().workLogs.map((l) => l.logId)).toEqual(['l2'])

    await p
    expect(workLogsApi.remove).toHaveBeenCalledWith('l1')
  })
})
