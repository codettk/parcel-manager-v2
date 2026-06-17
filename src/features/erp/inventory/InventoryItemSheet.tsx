import { useState } from 'react'
import { X } from 'lucide-react'
import { Button, ConfirmInline, IconButton, Input, Sheet, Textarea } from '../../../components/ui'
import { useInventoryStore } from '../../../stores/inventory'
import type { InventoryItem } from '../../../types/api/inventoryItems'

/** 시트 로컬 draft — 저장 버튼 전에는 스토어·서버에 반영되지 않는다 (CONVENTIONS §3) */
interface ItemDraft {
  name: string
  unit: string
  category: string
  memo: string
}

function makeDraft(item: InventoryItem | undefined): ItemDraft {
  return {
    name: item?.name ?? '',
    unit: item?.unit ?? '',
    category: item?.category ?? '',
    memo: item?.memo ?? '',
  }
}

const fieldLabel = 'mb-1 block text-[13px] font-semibold text-ink-muted'

export interface InventoryItemSheetProps {
  /** 편집 대상 — undefined면 신규 생성 */
  item: InventoryItem | undefined
  onClose: () => void
}

/**
 * 재고 품목 작성/수정 시트 (디자인 lBPki, 슬라이스 5c) — 5a StaffSheet 선례.
 * 품목명·단위·분류·메모 + 비활성/재활성화. 로컬 useState draft → "저장"에서만 스토어 커밋(CONVENTIONS §3).
 */
export function InventoryItemSheet({ item, onClose }: InventoryItemSheetProps) {
  const createItem = useInventoryStore((s) => s.createItem)
  const updateItem = useInventoryStore((s) => s.updateItem)
  const deactivateItem = useInventoryStore((s) => s.deactivateItem)

  const [draft, setDraft] = useState<ItemDraft>(() => makeDraft(item))

  const isEdit = item !== undefined
  const nameTrimmed = draft.name.trim()
  const unitTrimmed = draft.unit.trim()
  const canSave = nameTrimmed.length > 0 && unitTrimmed.length > 0

  const handleSave = () => {
    if (!canSave) return
    if (isEdit) {
      updateItem(item.itemId, {
        name: nameTrimmed,
        unit: unitTrimmed,
        category: draft.category.trim() || null,
        memo: draft.memo.trim() || null,
      })
    } else {
      createItem({
        name: nameTrimmed,
        unit: unitTrimmed,
        category: draft.category.trim() || undefined,
        memo: draft.memo.trim() || undefined,
      })
    }
    onClose()
  }

  const handleDeactivate = () => {
    if (!isEdit) return
    deactivateItem(item.itemId)
    onClose()
  }

  const handleReactivate = () => {
    if (!isEdit) return
    updateItem(item.itemId, { active: true })
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">{isEdit ? '품목 수정' : '품목 추가'}</h2>
        <IconButton icon={X} size="sm" aria-label="닫기" onClick={onClose} />
      </header>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={fieldLabel}>
              품목명 <span className="text-danger">*</span>
            </span>
            <Input
              aria-label="품목명"
              value={draft.name}
              placeholder="예: 요소비료"
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </label>
          <label>
            <span className={fieldLabel}>
              단위 <span className="text-danger">*</span>
            </span>
            <Input
              aria-label="단위"
              value={draft.unit}
              placeholder="예: 포·kg·박스"
              onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
            />
          </label>
        </div>

        <label>
          <span className={fieldLabel}>분류</span>
          <Input
            aria-label="분류"
            value={draft.category}
            placeholder="예: 비료·농약·종자"
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
          />
        </label>

        <label>
          <span className={fieldLabel}>메모</span>
          <Textarea
            aria-label="메모"
            rows={2}
            value={draft.memo}
            placeholder="메모를 입력하세요"
            onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
          />
        </label>
      </div>

      <Button full className="mt-4" disabled={!canSave} onClick={handleSave}>
        저장
      </Button>
      {isEdit &&
        (item.active ? (
          <div className="mt-2 flex justify-center">
            <ConfirmInline label="비활성" confirmLabel="비활성 처리" onConfirm={handleDeactivate} />
          </div>
        ) : (
          <div className="mt-2 flex justify-center">
            <Button size="sm" variant="secondary" onClick={handleReactivate}>
              재활성화
            </Button>
          </div>
        ))}
    </Sheet>
  )
}
