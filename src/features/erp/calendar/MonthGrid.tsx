import { useMemo } from 'react'
import type { InventoryTransaction } from '../../../types/api/inventoryTransactions'
import type { WorkLog } from '../../../types/api/workLogs'
import { buildMonthGrid, groupByDate } from './aggregate'
import { DayCell, type DayMarkers } from './DayCell'
import { WEEKDAYS } from './format'

export interface MonthGridProps {
  year: number
  month: number
  /** 그리드 오늘 강조 기준 (테스트 주입 가능) */
  today: string
  workLogs: readonly WorkLog[]
  transactions: readonly InventoryTransaction[]
  onSelectDate: (date: string) => void
}

/** 빈 마커 — 항목 없는 날 (객체 재생성 회피) */
const NO_MARKER: DayMarkers = { work: false, in: false, out: false }

/**
 * 7열 월 그리드 (디자인 rR9xW). 요일 헤더 + buildMonthGrid 셀.
 * 항목→셀 매핑은 groupByDate 문자열 키로만 비교(절충 3 — 하루 밀림 방지).
 */
export function MonthGrid({
  year,
  month,
  today,
  workLogs,
  transactions,
  onSelectDate,
}: MonthGridProps) {
  const cells = useMemo(() => buildMonthGrid(year, month, today), [year, month, today])
  const groups = useMemo(() => groupByDate(workLogs, transactions), [workLogs, transactions])

  return (
    <div data-testid="month-grid" className="flex flex-1 flex-col">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((label, i) => (
          <span
            key={label}
            className={`py-2 text-center text-[12px] font-semibold ${
              i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-ink-muted'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      {/* 날짜 셀 */}
      <div className="grid flex-1 grid-cols-7">
        {cells.map((cell) => {
          const day = groups[cell.date]
          const markers: DayMarkers =
            day === undefined
              ? NO_MARKER
              : {
                  work: day.workLogs.length > 0,
                  in: day.transactions.some((t) => t.type === 'in'),
                  out: day.transactions.some((t) => t.type === 'out'),
                }
          return (
            <DayCell key={cell.date} cell={cell} markers={markers} onSelect={onSelectDate} />
          )
        })}
      </div>
    </div>
  )
}
