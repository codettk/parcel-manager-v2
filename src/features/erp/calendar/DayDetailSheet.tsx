import { useState } from 'react'
import { Boxes, CalendarX2, ChevronRight, ClipboardList, Users, X } from 'lucide-react'
import { EmptyState, Sheet } from '../../../components/ui'
import { useUiStore } from '../../../stores/ui'
import type { InventoryTransaction } from '../../../types/api/inventoryTransactions'
import type { WorkLog } from '../../../types/api/workLogs'
import { WorkLogSheet } from '../worklog/WorkLogSheet'
import { formatDayHeader, formatWon } from './format'

export interface DayDetailSheetProps {
  /** 선택된 날짜 YYYY-MM-DD */
  date: string
  workLogs: WorkLog[]
  transactions: InventoryTransaction[]
  onClose: () => void
}

/**
 * 일(날짜) 상세 (디자인 ycpRB/nWx51/N7U9d) — 그날 업무일지·거래 모아보기 + 드릴인.
 * 업무일지 탭 → 기존 5b WorkLogSheet(수정, AC-8). 거래 탭 → 5c 재고 뷰로 이동(읽기).
 * 항목 없으면 EmptyState(AC-10). 공통 Sheet라 모바일 BottomSheet·와이드 우측 비모달 SidePanel 자동.
 */
export function DayDetailSheet({ date, workLogs, transactions, onClose }: DayDetailSheetProps) {
  const openInventoryView = useUiStore((s) => s.openInventoryView)
  const closeCalendarView = useUiStore((s) => s.closeCalendarView)
  // 업무일지 드릴인 — 시트 위 시트(로컬 상태). null=닫힘
  const [editLog, setEditLog] = useState<WorkLog | null>(null)

  const empty = workLogs.length === 0 && transactions.length === 0

  return (
    <>
      <Sheet onClose={onClose}>
        <div className="flex max-h-[70vh] flex-col" data-testid="day-detail">
          {/* 헤더 */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[15px] font-bold text-ink">{formatDayHeader(date)}</h2>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-md text-ink-muted active:bg-surface-alt"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {empty ? (
              <EmptyState
                icon={CalendarX2}
                message="이 날엔 기록이 없어요"
              />
            ) : (
              <>
                {workLogs.length > 0 && (
                  <section className="px-4 pt-3">
                    <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
                      <ClipboardList size={13} aria-hidden className="text-pro" />
                      업무일지
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {workLogs.map((log) => (
                        <li key={log.logId}>
                          <button
                            type="button"
                            onClick={() => setEditLog(log)}
                            data-testid={`day-worklog-${log.logId}`}
                            className="flex w-full items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-left active:bg-surface-alt"
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-pro-soft text-pro">
                              <ClipboardList size={16} aria-hidden />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-[14px] font-semibold text-ink">
                                {log.title}
                              </span>
                              <span className="flex items-center gap-1 text-[12px] text-ink-muted">
                                <Users size={11} aria-hidden />
                                투입 {log.workers.length}명 ·{' '}
                                <span className="font-mono font-semibold text-pro">
                                  {formatWon(log.totalCost)}
                                </span>
                              </span>
                            </span>
                            <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-muted" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {transactions.length > 0 && (
                  <section className="px-4 pt-3 pb-3">
                    <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
                      <Boxes size={13} aria-hidden className="text-primary" />
                      입출고 거래
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {transactions.map((txn) => (
                        <li key={txn.txnId}>
                          <TransactionRow
                            txn={txn}
                            onOpen={() => {
                              // 풀스크린 뷰 상호배타 (검증 반려 B-1): 캘린더 뷰를 먼저 닫아야
                              // CalendarView(z-30)가 InventoryView(z-30) 위로 paint돼 드릴인이
                              // 가려지는 죽은 경로를 막는다. 일 상세 닫기는 onClose가 담당.
                              closeCalendarView()
                              openInventoryView()
                            }}
                            onClose={onClose}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </Sheet>

      {editLog !== null && (
        <WorkLogSheet log={editLog} onClose={() => setEditLog(null)} />
      )}
    </>
  )
}

function TransactionRow({
  txn,
  onOpen,
  onClose,
}: {
  txn: InventoryTransaction
  onOpen: () => void
  onClose: () => void
}) {
  const isIn = txn.type === 'in'
  return (
    <button
      type="button"
      data-testid={`day-txn-${txn.txnId}`}
      onClick={() => {
        // 거래 드릴인 — 5c 재고 뷰로 이동(읽기). 캘린더는 새 거래 편집 UI를 만들지 않는다(절충 4)
        onClose()
        onOpen()
      }}
      className="flex w-full items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-left active:bg-surface-alt"
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
          isIn ? 'bg-primary/10 text-primary' : 'bg-danger/10 text-danger'
        }`}
      >
        <Boxes size={16} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              isIn ? 'bg-primary/10 text-primary' : 'bg-danger/10 text-danger'
            }`}
          >
            {isIn ? '입고' : '출고'}
          </span>
          <span className="truncate text-[14px] font-semibold text-ink">
            {txn.itemNameSnapshot}
          </span>
        </span>
        <span className="text-[12px] text-ink-muted">
          {isIn ? '+' : '-'}
          {txn.quantity} {txn.unitSnapshot}
          {txn.amount !== null && (
            <>
              {' · '}
              <span className="font-mono">{formatWon(txn.amount)}</span>
            </>
          )}
        </span>
      </span>
      <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-muted" />
    </button>
  )
}
