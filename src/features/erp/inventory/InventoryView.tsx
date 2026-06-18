import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Boxes, ChevronRight, Plus, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button, EmptyState, Switch } from '../../../components/ui'
import { selectBalances, useInventoryStore } from '../../../stores/inventory'
import { useUiStore } from '../../../stores/ui'
import type { InventoryItem } from '../../../types/api/inventoryItems'
import { InventoryItemSheet } from './InventoryItemSheet'
import { TransactionHistory } from './TransactionHistory'
import { formatQty } from './format'

/** 시트 상태 — null=닫힘, 'new'=생성, InventoryItem=편집 */
type SheetState = null | 'new' | InventoryItem

/**
 * 재고 품목 목록 풀스크린 뷰 (디자인 I5sVf/fNLIM, 슬라이스 5c) — 5a StaffView·5b WorkLogView 선례.
 * 품목 행(품목명·단위·분류·현재고(음수 danger)) + 비활성 포함 토글 + 빈 상태 + 추가 (AC-16·17).
 * 현재고는 거래 합산 파생(selectBalances·computeBalances, 절충 1) — 전 거래를 1회 로드해 합산한다.
 * 품목 행 탭 → 그 품목의 거래 이력 뷰(TransactionHistory)로 진입. 거래 작성도 이력 뷰에서.
 */
export function InventoryView() {
  const close = useUiStore((s) => s.closeInventoryView)
  const items = useInventoryStore((s) => s.items)
  const transactions = useInventoryStore((s) => s.transactions)
  const includeInactive = useInventoryStore((s) => s.includeInactive)
  const setIncludeInactive = useInventoryStore((s) => s.setIncludeInactive)
  const loadItems = useInventoryStore((s) => s.loadItems)
  const loadTransactions = useInventoryStore((s) => s.loadTransactions)
  const updateItem = useInventoryStore((s) => s.updateItem)

  const [sheet, setSheet] = useState<SheetState>(null)
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null)

  // 뷰 열 때 단발 fetch (절충 0) — 품목 + 전 거래(현재고 합산용). 실패해도 기존 목록 유지(낙관 패턴)
  useEffect(() => {
    void loadItems().catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[inventory] 품목 로드 실패:', err)
    })
    void loadTransactions().catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[inventory] 거래 로드 실패:', err)
    })
  }, [loadItems, loadTransactions])

  // 현재고 맵 — 거래 합산 파생(절충 1). 거래 생성·삭제 시 자동 정합(낙관 업데이트, AC-17)
  const balances = useMemo(() => selectBalances(transactions), [transactions])

  const activeCount = useMemo(() => items.filter((i) => i.active).length, [items])
  const inactiveCount = items.length - activeCount
  const visible = useMemo(
    () => (includeInactive ? items : items.filter((i) => i.active)),
    [items, includeInactive],
  )

  const reactivate = (i: InventoryItem) => updateItem(i.itemId, { active: true })

  // 품목별 이력 뷰가 열려 있으면 그 위로(z-40) 띄운다 — 목록(z-30)을 가린다
  if (historyItem !== null) {
    // 최신 마스터 반영(수정 후) — items에서 현재 행을 다시 찾는다
    const current = items.find((i) => i.itemId === historyItem.itemId) ?? historyItem
    return <TransactionHistory item={current} onBack={() => setHistoryItem(null)} />
  }

  return (
    <div data-testid="inventory-view" className="absolute inset-0 z-30 flex flex-col bg-surface">
      {/* 헤더 */}
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
          <h1 className="text-[17px] font-bold text-ink">재고</h1>
          <p className="text-[12px] text-ink-muted">
            품목 {activeCount}종{includeInactive && inactiveCount > 0 && ` · 비활성 ${inactiveCount}종`}
          </p>
        </div>
        <Button size="sm" onClick={() => setSheet('new')}>
          <Plus size={15} aria-hidden />
          품목
        </Button>
      </div>

      {/* 비활성 포함 토글 */}
      <div className="flex items-center justify-between border-b border-border px-4 pb-2">
        <span className="text-[13px] text-ink-muted">비활성 포함 보기</span>
        <Switch checked={includeInactive} onChange={setIncludeInactive} />
      </div>

      {/* 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <EmptyState
            icon={Boxes}
            message="아직 등록된 품목이 없어요"
            action={
              <Button size="sm" onClick={() => setSheet('new')}>
                <Plus size={15} aria-hidden />
                품목 추가
              </Button>
            }
          />
        ) : (
          visible.map((i) => (
            <ItemRow
              key={i.itemId}
              item={i}
              balance={balances[i.itemId] ?? 0}
              onOpen={() => setHistoryItem(i)}
              onEdit={() => setSheet(i)}
              onReactivate={() => reactivate(i)}
            />
          ))
        )}
      </div>

      {sheet !== null && (
        <InventoryItemSheet
          item={sheet === 'new' ? undefined : sheet}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

interface ItemRowProps {
  item: InventoryItem
  balance: number
  onOpen: () => void
  onEdit: () => void
  onReactivate: () => void
}

function ItemRow({ item, balance, onOpen, onEdit, onReactivate }: ItemRowProps) {
  const negative = balance < 0
  return (
    <div
      className={`flex items-center gap-3 border-b border-border px-3 py-2.5 ${
        item.active ? '' : 'opacity-60'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${item.name} 거래 이력`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pro-soft text-pro">
          <Boxes size={16} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold text-ink">{item.name}</span>
          <span className="text-[12px] text-ink-muted">
            {item.category !== null && `${item.category} · `}단위 {item.unit}
          </span>
        </span>
      </button>

      {item.active ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex shrink-0 items-center gap-1 text-right"
          aria-label={`${item.name} 현재고`}
        >
          <span className="flex flex-col items-end">
            <span
              className={`font-mono text-[17px] font-bold ${negative ? 'text-danger' : 'text-ink'}`}
              data-testid="item-balance"
            >
              {formatQty(balance)}
            </span>
            {negative && (
              <span className="flex items-center gap-0.5 text-[11px] font-semibold text-danger">
                <TriangleAlert size={10} aria-hidden />
                재고 음수
              </span>
            )}
            {!negative && <span className="text-[11px] text-ink-muted">{item.unit}</span>}
          </span>
          <ChevronRight size={16} aria-hidden className="text-ink-muted" />
        </button>
      ) : (
        <Button size="sm" variant="secondary" onClick={onReactivate}>
          <RotateCcw size={13} aria-hidden />
          재활성화
        </Button>
      )}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${item.name} 수정`}
        className="shrink-0 rounded-md px-2 py-1 text-[12px] text-ink-muted active:bg-surface-alt"
      >
        수정
      </button>
    </div>
  )
}
