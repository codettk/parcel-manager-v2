// 캘린더 집계 순수 함수 (슬라이스 5d) — React·서버 비의존 클라 전용 모듈.
// 5b 업무일지·5c 거래의 날짜 데이터를 월/일 달력에 그룹·요약·격자화한다.
//
// 날짜 경계(절충 3 — 함정 회피): workDate·txnDate는 YYYY-MM-DD 로컬 문자열이다.
// 항목 → 셀 매핑은 문자열 동등 비교만 사용한다. `new Date("YYYY-MM-DD")`로 파싱 후
// getDate/getMonth로 재추출하면 UTC 자정 파싱으로 하루 밀릴 수 있어 금지.
// 그리드 셀 날짜는 로컬 Date 산술로 만들되 키 문자열을 연·월·일 명시로 조립한다.
import type { InventoryTransaction } from '../../../types/api/inventoryTransactions'
import type { WorkLog } from '../../../types/api/workLogs'

/** 하루치 항목 묶음 — 같은 YYYY-MM-DD 키에 귀속된 업무일지·거래 */
export interface DayItems {
  workLogs: WorkLog[]
  transactions: InventoryTransaction[]
}

/** 날짜별 집계 맵 — 키는 YYYY-MM-DD 문자열. 항목 없는 날짜는 키가 없다 */
export type DateGroups = Record<string, DayItems>

/** 하루치 요약 — 건수·합계. summarizeDay 반환 */
export interface DaySummary {
  workLogCount: number
  /** 그날 업무일지 인건비 합계 (Σ totalCost) */
  laborCost: number
  inCount: number
  outCount: number
  /** 입고 금액 합계 (amount null은 0) */
  inAmount: number
  /** 출고 금액 합계 (amount null은 0) */
  outAmount: number
}

/**
 * 업무일지·거래를 YYYY-MM-DD 키로 그룹한다 (AC-1).
 * 항목의 workDate/txnDate 문자열을 키로 직접 사용 — UTC 변환 없음(하루 밀림 방지, 절충 3).
 * 항목 없는 날짜는 맵에 키를 만들지 않는다.
 */
export function groupByDate(
  workLogs: readonly WorkLog[],
  transactions: readonly InventoryTransaction[],
): DateGroups {
  const groups: DateGroups = {}
  const bucket = (key: string): DayItems => {
    const existing = groups[key]
    if (existing !== undefined) return existing
    const created: DayItems = { workLogs: [], transactions: [] }
    groups[key] = created
    return created
  }
  for (const log of workLogs) bucket(log.workDate).workLogs.push(log)
  for (const txn of transactions) bucket(txn.txnDate).transactions.push(txn)
  return groups
}

/**
 * 하루치 업무일지·거래를 건수·금액 합계로 요약한다 (AC-2).
 * amount null은 0으로 무시. 빈 입력은 모든 합계·건수 0.
 */
export function summarizeDay(
  workLogsOfDay: readonly WorkLog[],
  transactionsOfDay: readonly InventoryTransaction[],
): DaySummary {
  let laborCost = 0
  for (const log of workLogsOfDay) laborCost += log.totalCost

  let inCount = 0
  let outCount = 0
  let inAmount = 0
  let outAmount = 0
  for (const txn of transactionsOfDay) {
    const amount = txn.amount ?? 0
    if (txn.type === 'in') {
      inCount += 1
      inAmount += amount
    } else {
      outCount += 1
      outAmount += amount
    }
  }

  return {
    workLogCount: workLogsOfDay.length,
    laborCost,
    inCount,
    outCount,
    inAmount,
    outAmount,
  }
}

/** 2자리 0 패딩 — 월·일 키 조립 */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 그 달 1일~말일 from/to 문자열을 반환한다 (AC-3).
 * month는 1~12(1-based). 윤년/월말은 로컬 Date(year, month, 0).getDate()로 정확히 계산한다
 * (day=0은 전월 말일 → month가 1-based이므로 그 달의 말일). UTC 미사용.
 * 반환값은 api.workLogs.list({from,to})·api.stockTransactions.list({from,to})에 그대로 전달 가능.
 */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const mm = pad2(month)
  const lastDay = new Date(year, month, 0).getDate()
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${pad2(lastDay)}`,
  }
}

/** 월 그리드 셀 — 자신의 YYYY-MM-DD 키 + 현재월/오늘 플래그 */
export interface MonthGridCell {
  /** YYYY-MM-DD — 항목 매핑은 이 문자열로만 비교(절충 3) */
  date: string
  /** 1~31 표시용 일자 */
  day: number
  /** 현재월이면 true, 인접월(앞뒤 채움)이면 false → 흐림 처리 */
  inMonth: boolean
  /** 오늘 셀이면 true */
  isToday: boolean
}

/** 오늘 날짜 YYYY-MM-DD (로컬) — 그리드 today 강조 기준 (worklog todayIso 동형) */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * 월 뷰 7열 그리드 셀 배열을 만든다 (AC-4).
 * 일요일 시작(0=일). 그 달 1일 앞의 빈칸을 전월 셀로, 마지막 주 뒤를 익월 셀로 채워
 * 항상 7의 배수 길이(7열 정렬 가능)를 반환한다. 각 셀은 로컬 Date 산술로 키를 만들되
 * 항목 매핑은 셀의 date 문자열로만 비교한다(절충 3). today는 인자로 받아 테스트 가능.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  today: string = todayIso(),
): MonthGridCell[] {
  // month는 1-based; Date는 0-based month
  const firstOfMonth = new Date(year, month - 1, 1)
  const startWeekday = firstOfMonth.getDay() // 0=일 ~ 6=토
  const daysInMonth = new Date(year, month, 0).getDate()

  // 그리드 시작 = 1일이 속한 주의 일요일 (앞 채움 = startWeekday칸)
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7

  const cells: MonthGridCell[] = []
  for (let i = 0; i < totalCells; i += 1) {
    // 셀 날짜 = (month-1)월 1일 - startWeekday + i 일 (로컬 Date 산술 — 표시용)
    const cellDate = new Date(year, month - 1, 1 - startWeekday + i)
    const key = `${cellDate.getFullYear()}-${pad2(cellDate.getMonth() + 1)}-${pad2(cellDate.getDate())}`
    cells.push({
      date: key,
      day: cellDate.getDate(),
      inMonth: cellDate.getMonth() === month - 1 && cellDate.getFullYear() === year,
      isToday: key === today,
    })
  }
  return cells
}
