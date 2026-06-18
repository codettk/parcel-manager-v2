import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Building2, Plus, ScrollText } from 'lucide-react'
import { Button, ConfirmInline, EmptyState } from '../../../components/ui'
import { useInventoryStore } from '../../../stores/inventory'
import { computeItemBalance } from '../../../utils/stockBalance'
import type { InventoryItem } from '../../../types/api/inventoryItems'
import type { InventoryTransaction } from '../../../types/api/inventoryTransactions'
import { StockTransactionSheet } from './StockTransactionSheet'
import { formatQty, formatWon } from './format'

export interface TransactionHistoryProps {
  /** 이력을 볼 품목 */
  item: InventoryItem
  onBack: () => void
}

/**
 * 품목별 거래 이력 뷰 (디자인 RUTmL, 슬라이스 5c) — 5b WorkLogView 선례: 풀스크린 레이어.
 * 현재고 헤더(computeItemBalance, 음수 danger) + 기간 필터 + 거래일순 카드(유형 배지·부호 수량·거래처·금액)
 * + 하드 삭제 ConfirmInline (AC-11) + 거래 작성 진입점 (AC-18).
 * 거래는 itemId 필터로 서버에서 받되, 현재고는 그 목록을 공유 순수 모듈로 합산해 항상 정합한다.
 */
export function TransactionHistory({ item, onBack }: TransactionHistoryProps) {
  const transactions = useInventoryStore((s) => s.transactions)
  const loadTransactions = useInventoryStore((s) => s.loadTransactions)
  const deleteTransaction = useInventoryStore((s) => s.deleteTransaction)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)

  // 뷰 열 때 단발 fetch (절충 0) — 이 품목만 조회. 실패해도 기존 목록 유지(낙관 패턴)
  useEffect(() => {
    void loadTransactions({ itemId: item.itemId }).catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[inventory] 거래 이력 로드 실패:', err)
    })
  }, [loadTransactions, item.itemId])

  const applyRange = () => {
    void loadTransactions({
      itemId: item.itemId,
      from: from || undefined,
      to: to || undefined,
    }).catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[inventory] 기간 필터 로드 실패:', err)
    })
  }

  // 현재고는 거래 합산 파생(절충 1) — 거래 삭제 시 자동 감소. 음수 허용.
  // 기간 필터가 걸리면 목록이 일부라 현재고도 그 부분 합이 된다(이력 뷰의 의도된 동작 — 절충 5).
  const balance = useMemo(
    () =>
      computeItemBalance(
        transactions
          .filter((t) => t.itemId === item.itemId)
          .map((t) => ({ itemId: t.itemId, type: t.type, quantity: t.quantity })),
      ),
    [transactions, item.itemId],
  )

  const visible = useMemo(
    () => transactions.filter((t) => t.itemId === item.itemId),
    [transactions, item.itemId],
  )

  const negative = balance < 0

  return (
    <div data-testid="transaction-history" className="absolute inset-0 z-40 flex flex-col bg-surface">
      {/* 헤더 */}
      <div className="flex items-center gap-1 py-1 pr-4 pl-2">
        <button
          type="button"
          aria-label="뒤로"
          onClick={onBack}
          className="flex size-10 shrink-0 items-center justify-center rounded-md text-ink active:bg-surface-alt"
        >
          <ArrowLeft size={20} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-bold text-ink">{item.name}</h1>
          <p className="text-[12px] text-ink-muted">
            {item.category !== null && `${item.category} · `}
            단위 {item.unit}
          </p>
        </div>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus size={15} aria-hidden />
          거래
        </Button>
      </div>

      {/* 현재고 배너 — 음수면 danger 토큰 (절충 1) */}
      <div
        className={`mx-3 mb-2 flex items-center justify-between rounded-md px-4 py-3 text-surface ${
          negative ? 'bg-danger' : 'bg-pro'
        }`}
      >
        <span className="text-[13px] font-semibold">현재고</span>
        <span
          className="font-mono text-[20px] font-bold"
          data-testid="history-balance"
          aria-label="현재고"
        >
          {formatQty(balance)} {item.unit}
        </span>
      </div>

      {/* 기간 필터 */}
      <div className="flex items-center gap-2 border-b border-border px-4 pb-2">
        <input
          type="date"
          aria-label="시작일"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 text-[13px] text-ink focus:border-primary focus:outline-none"
        />
        <span className="text-[13px] text-ink-muted">~</span>
        <input
          type="date"
          aria-label="종료일"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 text-[13px] text-ink focus:border-primary focus:outline-none"
        />
        <Button size="sm" variant="secondary" onClick={applyRange}>
          기간 적용
        </Button>
      </div>

      {/* 거래 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            message="아직 입·출고 거래가 없어요"
            action={
              <Button size="sm" onClick={() => setSheetOpen(true)}>
                <Plus size={15} aria-hidden />첫 거래 기록
              </Button>
            }
          />
        ) : (
          visible.map((txn) => (
            <TransactionRow
              key={txn.txnId}
              txn={txn}
              onDelete={() => deleteTransaction(txn.txnId)}
            />
          ))
        )}
      </div>

      {sheetOpen && <StockTransactionSheet item={item} onClose={() => setSheetOpen(false)} />}
    </div>
  )
}

function TransactionRow({ txn, onDelete }: { txn: InventoryTransaction; onDelete: () => void }) {
  const isIn = txn.type === 'in'
  const sign = isIn ? '+' : '-'
  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
      <span className="flex w-12 shrink-0 flex-col items-center gap-0.5">
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
            isIn ? 'bg-pro-soft text-pro' : 'bg-danger/10 text-danger'
          }`}
        >
          {isIn ? '입고' : '출고'}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] text-ink-muted">{txn.txnDate}</span>
        <span className="flex items-center gap-1 text-[12px] text-ink-muted">
          {txn.contactNameSnapshot !== null ? (
            <>
              <Building2 size={11} aria-hidden />
              {txn.contactNameSnapshot}
            </>
          ) : (
            '거래처 미연결'
          )}
          {txn.memo !== null && txn.memo !== '' && <span className="truncate"> · {txn.memo}</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span
          className={`font-mono text-[15px] font-bold ${isIn ? 'text-pro' : 'text-danger'}`}
        >
          {sign}
          {formatQty(txn.quantity)} {txn.unitSnapshot}
        </span>
        {txn.amount !== null && (
          <span className="font-mono text-[12px] text-ink-muted">{formatWon(txn.amount)}</span>
        )}
      </span>
      <ConfirmInline label="삭제" confirmLabel="삭제 확정" onConfirm={onDelete} />
    </div>
  )
}
