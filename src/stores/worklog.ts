import { create } from 'zustand'
import { api } from '../lib/api'
import { computeLogTotal } from '../utils/workLogCost'
import type { WorkLog, WorkLogWorker, WorkLogWorkerInput } from '../types/api/workLogs'

/**
 * 영농 ERP 업무일지 스토어 (슬라이스 5b).
 * 전역 공유 단일 테이블(절충 0·5a 일관) — 뷰 열 때 단발 fetch + 낙관적 CRUD(롤백 없음, 절충 4).
 * 인력 마스터(5a useErpStore.staff)는 시트 picker가 직접 참조한다 — 이 스토어는 일지만 보유.
 * 시트 내부 편집은 시트 로컬 draft가 담당하고, 저장 시점에만 아래 액션으로 커밋한다(CONVENTIONS §3).
 * 5b는 M-10 자동 계산기(calcRecipes·src/features/calculator/)와 코드·스토어·테이블이 전부 분리(절충 5).
 */

/** 기간 필터 — 미설정이면 전체. 뷰가 from~to draft를 정규화해 넘긴다 */
export interface WorkLogRange {
  from?: string
  to?: string
}

/** 생성 입력 — 시트 draft가 정규화(trim·숫자 변환·라인 스냅샷 입력)해 넘긴다 */
export interface WorkLogCreateInput {
  workDate: string
  title: string
  memo?: string
  workers: WorkLogWorkerInput[]
}

/** 수정 입력 — 헤더 부분 갱신 + workers 지정 시 라인 전체 치환(절충 4) */
export interface WorkLogUpdateInput {
  workDate?: string
  title?: string
  memo?: string | null
  workers?: WorkLogWorkerInput[]
}

export interface WorkLogState {
  /** 서버 동기화 업무일지 목록 — work_date 내림차순(서버 정렬 권위, 낙관 추가도 정렬 유지) */
  workLogs: WorkLog[]
  /** 현재 적용된 기간 필터 (뷰 표시·재조회용) */
  range: WorkLogRange

  /** 목록 로드 — 기간 필터 적용. 실패해도 기존 목록 유지(낙관 패턴) */
  loadWorkLogs: (range?: WorkLogRange) => Promise<void>
  /** 생성 — 낙관적 추가(임시 행) 후 서버 응답으로 교체 + 날짜순 재정렬 */
  createWorkLog: (input: WorkLogCreateInput, staffNameById: (id: string) => string) => Promise<void>
  /** 수정 — 낙관적 병합(라인 지정 시 전체 치환) 후 서버 응답으로 교체 */
  updateWorkLog: (
    logId: string,
    input: WorkLogUpdateInput,
    staffNameById: (id: string) => string,
  ) => Promise<void>
  /** 하드 삭제 — 낙관적 제거 후 DELETE (롤백 없음) */
  deleteWorkLog: (logId: string) => Promise<void>
}

/** 낙관적 임시 행 id — 서버 응답이 진짜 id로 교체한다 */
function tempId(): string {
  return `wlg-optimistic-${crypto.randomUUID()}`
}

const NOW_ISO = () => new Date().toISOString()

/** work_date 내림차순(최신 우선) 정렬 — 동률은 createdAt 내림차순으로 안정화 */
function sortByDateDesc(list: WorkLog[]): WorkLog[] {
  return [...list].sort((a, b) => {
    if (a.workDate !== b.workDate) return a.workDate < b.workDate ? 1 : -1
    return a.createdAt < b.createdAt ? 1 : -1
  })
}

/** 입력 라인 → 낙관적 표시용 라인(스냅샷 이름은 마스터에서 끌어옴, 서버가 최종 권위) */
function toOptimisticWorker(
  w: WorkLogWorkerInput,
  staffNameById: (id: string) => string,
): WorkLogWorker {
  return {
    staffId: w.staffId,
    staffNameSnapshot: staffNameById(w.staffId),
    appliedWage: w.appliedWage,
    workRatio: w.workRatio,
  }
}

export const useWorkLogStore = create<WorkLogState>()((set, get) => ({
  workLogs: [],
  range: {},

  loadWorkLogs: async (range) => {
    const next = range ?? get().range
    const list = await api.workLogs.list(next)
    set({ workLogs: sortByDateDesc(list), range: next })
  },

  createWorkLog: async (input, staffNameById) => {
    const id = tempId()
    const now = NOW_ISO()
    const workers = input.workers.map((w) => toOptimisticWorker(w, staffNameById))
    const optimistic: WorkLog = {
      logId: id,
      workDate: input.workDate,
      title: input.title,
      memo: input.memo ?? null,
      workers,
      totalCost: computeLogTotal(workers),
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    }
    set({ workLogs: sortByDateDesc([optimistic, ...get().workLogs]) })
    try {
      const saved = await api.workLogs.create(input)
      set({ workLogs: sortByDateDesc(get().workLogs.map((l) => (l.logId === id ? saved : l))) })
    } catch (err) {
      // 낙관 유지(롤백 없음) — 다음 loadWorkLogs가 서버와 정합한다
      if (import.meta.env.DEV) console.error('[erp] 업무일지 생성 실패:', err)
    }
  },

  updateWorkLog: async (logId, input, staffNameById) => {
    set({
      workLogs: sortByDateDesc(
        get().workLogs.map((l) => {
          if (l.logId !== logId) return l
          const workers =
            input.workers !== undefined
              ? input.workers.map((w) => toOptimisticWorker(w, staffNameById))
              : l.workers
          return {
            ...l,
            ...(input.workDate !== undefined && { workDate: input.workDate }),
            ...(input.title !== undefined && { title: input.title }),
            ...(input.memo !== undefined && { memo: input.memo }),
            workers,
            totalCost: computeLogTotal(workers),
            updatedAt: NOW_ISO(),
          }
        }),
      ),
    })
    try {
      const saved = await api.workLogs.update(logId, input)
      set({ workLogs: sortByDateDesc(get().workLogs.map((l) => (l.logId === logId ? saved : l))) })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[erp] 업무일지 수정 실패:', err)
    }
  },

  deleteWorkLog: async (logId) => {
    set({ workLogs: get().workLogs.filter((l) => l.logId !== logId) })
    try {
      await api.workLogs.remove(logId)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[erp] 업무일지 삭제 실패:', err)
    }
  },
}))
