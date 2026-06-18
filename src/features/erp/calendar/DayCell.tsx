import { cva } from 'class-variance-authority'
import type { MonthGridCell } from './aggregate'

/** 셀이 가진 활동 마커 종류 — 색 점으로 표시(업무=pro·입고=primary·출고=danger) */
export interface DayMarkers {
  work: boolean
  in: boolean
  out: boolean
}

export interface DayCellProps {
  cell: MonthGridCell
  markers: DayMarkers
  onSelect: (date: string) => void
}

const dayNumber = cva('text-[13px] tabular-nums', {
  variants: {
    inMonth: { true: '', false: 'text-ink-muted/40' },
    today: { true: '', false: '' },
  },
  compoundVariants: [
    { today: true, className: 'flex size-6 items-center justify-center rounded-full bg-primary font-bold text-surface' },
    { today: false, inMonth: true, className: 'text-ink' },
  ],
})

/**
 * 월 그리드 한 칸 (디자인 rR9xW). 일자 + 활동 마커 점.
 * 오늘은 채워진 원, 인접월은 흐림. 마커 없는 날은 점이 없다(빈 날 무마킹, AC-6).
 */
export function DayCell({ cell, markers, onSelect }: DayCellProps) {
  const hasMarker = markers.work || markers.in || markers.out
  return (
    <button
      type="button"
      onClick={() => onSelect(cell.date)}
      data-testid={`day-cell-${cell.date}`}
      data-today={cell.isToday ? 'true' : undefined}
      aria-label={cell.date}
      className="flex min-h-12 flex-col items-center gap-1 border-t border-border/60 py-1.5 active:bg-surface-alt"
    >
      <span className={dayNumber({ inMonth: cell.inMonth, today: cell.isToday })}>{cell.day}</span>
      <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
        {hasMarker && (
          <>
            {markers.work && (
              <span className="size-1.5 rounded-full bg-pro" data-testid="marker-work" />
            )}
            {markers.in && (
              <span className="size-1.5 rounded-full bg-primary" data-testid="marker-in" />
            )}
            {markers.out && (
              <span className="size-1.5 rounded-full bg-danger" data-testid="marker-out" />
            )}
          </>
        )}
      </span>
    </button>
  )
}
