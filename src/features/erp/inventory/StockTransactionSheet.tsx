import { useState } from 'react'
import { Building2, ChevronRight, CircleSlash, X } from 'lucide-react'
import { Button, IconButton, Input, SegmentedControl, Sheet, Textarea } from '../../../components/ui'
import { useInventoryStore } from '../../../stores/inventory'
import { useErpStore } from '../../../stores/erp'
import { sanitizeDecimalInput } from '../../calculator/calc'
import type { Contact } from '../../../types/api/contacts'
import type { InventoryItem } from '../../../types/api/inventoryItems'
import type { StockTxnType } from '../../../types/api/inventoryTransactions'
import { ContactPickerSheet } from './ContactPickerSheet'
import { formatWon, parsePrice, parseQty, previewAmount, todayIso } from './format'

const fieldLabel = 'mb-1 block text-[13px] font-semibold text-ink-muted'

/** 시트 로컬 draft — 수량·단가는 문자열(중간 상태 보존). 저장 시점에만 숫자 변환·커밋(CONVENTIONS §3) */
interface TxnDraft {
  type: StockTxnType
  quantity: string
  txnDate: string
  contactId: string | null
  contactName: string | null
  unitPrice: string
  memo: string
}

export interface StockTransactionSheetProps {
  /** 거래 대상 품목 — 스냅샷(품목명·단위) 표시·전송의 기준 (필수) */
  item: InventoryItem
  /** 작성 후 닫힘 */
  onClose: () => void
}

const TYPE_OPTIONS: { id: StockTxnType; label: string }[] = [
  { id: 'in', label: '입고' },
  { id: 'out', label: '출고' },
]

/**
 * 입·출고 거래 작성 시트 (디자인 lSLW7, 슬라이스 5c) — 5b WorkLogSheet 선례.
 * 품목(고정)·유형 SegmentedControl·수량·거래일·거래처 picker(선택)·단가·금액 자동·메모.
 * 거래는 생성만(수정 없음, 절충 5). 금액은 수량×단가 미리보기(서버 amount 동형, AC-18).
 * 로컬 draft → "거래 저장"에서만 스토어 커밋. 거래처 미연결 정상(절충 2·AC-9).
 */
export function StockTransactionSheet({ item, onClose }: StockTransactionSheetProps) {
  const createTransaction = useInventoryStore((s) => s.createTransaction)

  const [draft, setDraft] = useState<TxnDraft>(() => ({
    type: 'in',
    quantity: '',
    txnDate: todayIso(),
    contactId: null,
    contactName: null,
    unitPrice: '',
    memo: '',
  }))
  const [pickerOpen, setPickerOpen] = useState(false)

  const amount = previewAmount(draft.quantity, draft.unitPrice)
  const canSave = parseQty(draft.quantity) !== null && draft.txnDate !== ''

  const selectContact = (contact: Contact | null) => {
    setDraft((d) => ({
      ...d,
      contactId: contact?.contactId ?? null,
      contactName: contact?.name ?? null,
    }))
    setPickerOpen(false)
  }

  const handleSave = () => {
    const qty = parseQty(draft.quantity)
    if (qty === null) return
    const unitPrice = parsePrice(draft.unitPrice)
    // 콜백 동기 접근은 getState() (CONVENTIONS §3) — 거래처 상호 스냅샷 보강(낙관 표시용, 서버 권위)
    const contactName =
      draft.contactId !== null
        ? (useErpStore.getState().contacts.find((c) => c.contactId === draft.contactId)?.name ??
          draft.contactName)
        : null
    createTransaction(
      {
        itemId: item.itemId,
        type: draft.type,
        quantity: qty,
        txnDate: draft.txnDate,
        contactId: draft.contactId ?? undefined,
        unitPrice: unitPrice ?? undefined,
        memo: draft.memo.trim() || undefined,
      },
      { itemName: item.name, unit: item.unit, contactName },
    )
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">입·출고 거래</h2>
        <IconButton icon={X} size="sm" aria-label="닫기" onClick={onClose} />
      </header>

      <div className="flex flex-col gap-3">
        {/* 유형 — 입고/출고 SegmentedControl */}
        <div>
          <span className={fieldLabel}>
            유형 <span className="text-danger">*</span>
          </span>
          <SegmentedControl<StockTxnType>
            className="mt-1 w-full"
            options={TYPE_OPTIONS}
            value={draft.type}
            onChange={(type) => setDraft((d) => ({ ...d, type }))}
          />
        </div>

        {/* 품목 — 고정 표시(이 시트는 한 품목 거래만) */}
        <div>
          <span className={fieldLabel}>품목</span>
          <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-alt px-3 py-2.5">
            <span className="truncate text-[15px] font-semibold text-ink">{item.name}</span>
            <span className="text-[13px] text-ink-muted">({item.unit})</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={fieldLabel}>
              수량 <span className="text-danger">*</span>
            </span>
            <Input
              aria-label="수량"
              variant="numeric"
              inputMode="decimal"
              value={draft.quantity}
              placeholder="0"
              onChange={(e) =>
                setDraft((d) => ({ ...d, quantity: sanitizeDecimalInput(e.target.value) }))
              }
            />
          </label>
          <label>
            <span className={fieldLabel}>
              거래일 <span className="text-danger">*</span>
            </span>
            <Input
              aria-label="거래일"
              type="date"
              value={draft.txnDate}
              onChange={(e) => setDraft((d) => ({ ...d, txnDate: e.target.value }))}
            />
          </label>
        </div>

        {/* 거래처 연결 (선택) */}
        <div>
          <span className={fieldLabel}>거래처 연결</span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label="거래처 선택"
            className="flex w-full items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2.5 text-left active:bg-surface-alt"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-muted">
              {draft.contactId !== null ? (
                <Building2 size={14} aria-hidden />
              ) : (
                <CircleSlash size={14} aria-hidden />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
              {draft.contactName ?? '거래처 미연결'}
            </span>
            <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-muted" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={fieldLabel}>단가 (원)</span>
            <Input
              aria-label="단가"
              variant="numeric"
              inputMode="decimal"
              value={draft.unitPrice}
              placeholder="0"
              onChange={(e) =>
                setDraft((d) => ({ ...d, unitPrice: sanitizeDecimalInput(e.target.value) }))
              }
            />
          </label>
          <div>
            <span className={fieldLabel}>금액 (자동)</span>
            <div className="flex h-10 items-center rounded-sm border border-border bg-surface-alt px-3">
              <span
                className="font-mono text-[15px] font-semibold text-pro"
                data-testid="txn-amount"
                aria-label="금액"
              >
                {amount !== null ? formatWon(amount) : '-'}
              </span>
            </div>
          </div>
        </div>

        <label>
          <span className={fieldLabel}>메모</span>
          <Textarea
            aria-label="메모"
            rows={2}
            value={draft.memo}
            placeholder="예: 봄 정식 비료 입고"
            onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button variant="secondary" onClick={onClose}>
          취소
        </Button>
        <Button full disabled={!canSave} onClick={handleSave}>
          거래 저장
        </Button>
      </div>

      {pickerOpen && (
        <ContactPickerSheet
          selectedId={draft.contactId}
          onSelect={selectContact}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </Sheet>
  )
}
