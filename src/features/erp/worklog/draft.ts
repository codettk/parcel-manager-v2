// 업무일지 작성/수정 시트의 로컬 draft 모델·변환 — React 비의존 순수 로직(저장 시점에만 스토어 커밋).
// 근무율·일당은 문자열 draft로 보관해 소수점 입력 중간 상태("1.")를 보존한다(M-10 toRecipeNumber 재사용).
import { toRecipeNumber } from '../../calculator/calc'
import type { WorkLog, WorkLogWorkerInput } from '../../../types/api/workLogs'

/** 근무율 프리셋 — 전일 1.0·반일 0.5·연장 1.5 (절충 3). '직접'은 SegmentedControl이 별도로 처리 */
export const RATIO_PRESETS = [
  { id: 'full', label: '전일', value: 1 },
  { id: 'half', label: '반일', value: 0.5 },
  { id: 'overtime', label: '연장', value: 1.5 },
] as const

export type RatioPresetId = (typeof RATIO_PRESETS)[number]['id']

/** 시트 로컬 투입 인력 라인 draft — 일당·근무율은 문자열(중간 상태 보존), 이름은 스냅샷 표시용 */
export interface WorkerDraft {
  staffId: string
  staffNameSnapshot: string
  /** 적용 일당 — 문자열 draft(숫자 외 제거). 저장 시 정수 변환 */
  appliedWage: string
  /** 근무율 — 문자열 draft(소수 허용). 저장 시 toRecipeNumber */
  workRatio: string
}

/** 일지 헤더+라인 전체 draft */
export interface WorkLogDraft {
  workDate: string
  title: string
  memo: string
  workers: WorkerDraft[]
}

/** 천단위 구분 + "원" — 인건비 표기 (StaffView.formatWage 선례) */
export function formatWon(won: number): string {
  return `${won.toLocaleString('ko')}원`
}

/** 오늘 날짜 YYYY-MM-DD (로컬) — 신규 작성 시 기본 작업일 */
export function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 편집 대상 → draft (신규면 today·빈 라인) */
export function makeDraft(log: WorkLog | undefined): WorkLogDraft {
  if (log === undefined) {
    return { workDate: todayIso(), title: '', memo: '', workers: [] }
  }
  return {
    workDate: log.workDate,
    title: log.title,
    memo: log.memo ?? '',
    workers: log.workers.map((w) => ({
      staffId: w.staffId,
      staffNameSnapshot: w.staffNameSnapshot,
      appliedWage: String(w.appliedWage),
      workRatio: String(w.workRatio),
    })),
  }
}

/** draft 일당 문자열 → 0 이상 정수 (비숫자·빈 값은 0) */
export function draftWage(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '')
  if (digits === '') return 0
  const n = Number.parseInt(digits, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** draft 라인 → 서버 입력 라인 (스냅샷 이름은 서버가 채우므로 제외, 절충 2) */
export function toWorkerInput(d: WorkerDraft): WorkLogWorkerInput {
  return {
    staffId: d.staffId,
    appliedWage: draftWage(d.appliedWage),
    workRatio: toRecipeNumber(d.workRatio),
  }
}

/** 저장 가능 여부 — 제목 비어있지 않고 모든 라인의 근무율이 양수(계약 workRatio>0 충족) */
export function canSaveDraft(draft: WorkLogDraft): boolean {
  if (draft.title.trim().length === 0) return false
  return draft.workers.every((w) => toRecipeNumber(w.workRatio) > 0)
}
