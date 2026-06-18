import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../../../components/ui'
import { useErpStore } from '../../../stores/erp'
import { useInventoryStore } from '../../../stores/inventory'
import { useUiStore } from '../../../stores/ui'
import { useWorkLogStore } from '../../../stores/worklog'
import { groupByDate, monthRange, todayIso } from './aggregate'
import { DayDetailSheet } from './DayDetailSheet'
import { formatMonthLabel } from './format'
import { MonthGrid } from './MonthGrid'

/** 현재 연·월 (1-based month) — 헤더 이동 상태 */
interface YearMonth {
  year: number
  month: number
}

function todayYearMonth(): YearMonth {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/** 월 이동 — 12월 다음은 다음해 1월, 1월 이전은 전년 12월 */
function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const idx = (year * 12 + (month - 1) + delta)
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

/**
 * 영농 캘린더 월 뷰 풀스크린 레이어 (디자인 rR9xW/N7U9d, 슬라이스 5d) — 5b WorkLogView 선례.
 * 보이는 달의 from/to(monthRange)로 기존 5b·5c list를 재조회(월 이동마다, AC-9)하고
 * groupByDate/summarizeDay 순수 함수로 셀 마커·일 상세를 파생한다(frontend-only, 백엔드 무변경).
 * 전역 공유 — mockApi/서버가 반환하는 전체 목록을 표시한다(AC-11).
 */
export function CalendarView() {
  const close = useUiStore((s) => s.closeCalendarView)
  const workLogs = useWorkLogStore((s) => s.workLogs)
  const loadWorkLogs = useWorkLogStore((s) => s.loadWorkLogs)
  const transactions = useInventoryStore((s) => s.transactions)
  const loadTransactions = useInventoryStore((s) => s.loadTransactions)
  const loadStaff = useErpStore((s) => s.loadStaff)

  const [ym, setYm] = useState<YearMonth>(todayYearMonth)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const today = todayIso()

  // 보이는 달이 바뀔 때마다 그 달 범위로 5b·5c 재조회 (AC-9). 인력은 드릴인 시트 picker용.
  useEffect(() => {
    const range = monthRange(ym.year, ym.month)
    void loadWorkLogs(range).catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[calendar] 업무일지 로드 실패:', err)
    })
    void loadTransactions(range).catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[calendar] 거래 로드 실패:', err)
    })
    void loadStaff().catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[calendar] 인력 로드 실패:', err)
    })
  }, [ym, loadWorkLogs, loadTransactions, loadStaff])

  // 선택된 날의 항목 — 문자열 키 그룹에서 직접 꺼낸다(절충 3)
  const dayItems = useMemo(() => {
    if (selectedDate === null) return null
    const groups = groupByDate(workLogs, transactions)
    return groups[selectedDate] ?? { workLogs: [], transactions: [] }
  }, [selectedDate, workLogs, transactions])

  const goToday = () => {
    setYm(todayYearMonth())
  }

  return (
    <div data-testid="calendar-view" className="absolute inset-0 z-30 flex flex-col bg-surface">
      {/* 헤더 — 뒤로 + 제목 */}
      <div className="flex items-center gap-1 py-1 pr-4 pl-2">
        <button
          type="button"
          aria-label="뒤로"
          onClick={close}
          className="flex size-10 shrink-0 items-center justify-center rounded-md text-ink active:bg-surface-alt"
        >
          <ArrowLeft size={20} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-bold text-ink">캘린더</h1>
          <p className="text-[12px] text-ink-muted">
            업무일지 {workLogs.length}건 · 입출고 {transactions.length}건
          </p>
        </div>
      </div>

      {/* 월 이동 바 */}
      <div className="flex items-center justify-between border-b border-border px-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[18px] font-bold text-ink" data-testid="calendar-month">
            {formatMonthLabel(ym.year, ym.month)}
          </span>
          <Button size="sm" variant="secondary" onClick={goToday}>
            <CalendarDays size={14} aria-hidden />
            오늘
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => setYm((cur) => shiftMonth(cur, -1))}
            className="flex size-9 items-center justify-center rounded-md text-ink active:bg-surface-alt"
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => setYm((cur) => shiftMonth(cur, 1))}
            className="flex size-9 items-center justify-center rounded-md text-ink active:bg-surface-alt"
          >
            <ChevronRight size={20} aria-hidden />
          </button>
        </div>
      </div>

      {/* 월 그리드 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        <MonthGrid
          year={ym.year}
          month={ym.month}
          today={today}
          workLogs={workLogs}
          transactions={transactions}
          onSelectDate={setSelectedDate}
        />
      </div>

      {/* 범례 */}
      <div className="flex items-center justify-center gap-4 border-t border-border py-2.5 text-[12px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-pro" aria-hidden />
          업무일지
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" aria-hidden />
          입고
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-danger" aria-hidden />
          출고
        </span>
      </div>

      {selectedDate !== null && dayItems !== null && (
        <DayDetailSheet
          date={selectedDate}
          workLogs={dayItems.workLogs}
          transactions={dayItems.transactions}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}
