import { useState } from 'react'
import { X } from 'lucide-react'
import {
  Button,
  ConfirmInline,
  IconButton,
  Input,
  SegmentedControl,
  Sheet,
  Textarea,
} from '../../components/ui'
import { useErpStore } from '../../stores/erp'
import type { Contact, ContactKind } from '../../types/api/contacts'

/** 거래처 구분 라벨 — 매입처/매출처/양쪽 (계약 contactKind buy|sell|both) */
const KIND_OPTIONS: { id: ContactKind; label: string }[] = [
  { id: 'buy', label: '매입' },
  { id: 'sell', label: '매출' },
  { id: 'both', label: '매입·매출' },
]

/** 시트 로컬 draft — 저장 버튼 전에는 스토어·서버에 반영되지 않는다 (CONVENTIONS §3) */
interface ContactDraft {
  name: string
  manager: string
  phone: string
  kind: ContactKind
  memo: string
}

function makeDraft(contact: Contact | undefined): ContactDraft {
  return {
    name: contact?.name ?? '',
    manager: contact?.manager ?? '',
    phone: contact?.phone ?? '',
    kind: contact?.kind ?? 'buy',
    memo: contact?.memo ?? '',
  }
}

const sectionLabel = 'text-[13px] font-semibold text-ink'
const fieldLabel = 'mb-1 block text-[13px] font-semibold text-ink-muted'

export interface ContactSheetProps {
  /** 편집 대상 — undefined면 신규 생성 */
  contact: Contact | undefined
  onClose: () => void
}

export function ContactSheet({ contact, onClose }: ContactSheetProps) {
  const createContact = useErpStore((s) => s.createContact)
  const updateContact = useErpStore((s) => s.updateContact)
  const deactivateContact = useErpStore((s) => s.deactivateContact)

  const [draft, setDraft] = useState<ContactDraft>(() => makeDraft(contact))

  const isEdit = contact !== undefined
  const nameTrimmed = draft.name.trim()
  const canSave = nameTrimmed.length > 0

  const handleSave = () => {
    if (!canSave) return
    if (isEdit) {
      updateContact(contact.contactId, {
        name: nameTrimmed,
        manager: draft.manager.trim() || null,
        phone: draft.phone.trim() || null,
        kind: draft.kind,
        memo: draft.memo.trim() || null,
      })
    } else {
      createContact({
        name: nameTrimmed,
        manager: draft.manager.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        kind: draft.kind,
        memo: draft.memo.trim() || undefined,
      })
    }
    onClose()
  }

  const handleDeactivate = () => {
    if (!isEdit) return
    deactivateContact(contact.contactId)
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">{isEdit ? '거래처 수정' : '거래처 추가'}</h2>
        <IconButton icon={X} size="sm" aria-label="닫기" onClick={onClose} />
      </header>

      <div className="flex flex-col gap-3">
        <label>
          <span className={fieldLabel}>
            상호 <span className="text-danger">*</span>
          </span>
          <Input
            aria-label="상호"
            value={draft.name}
            placeholder="상호 입력"
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </label>

        <div>
          <span className={fieldLabel}>구분</span>
          <SegmentedControl
            options={KIND_OPTIONS}
            value={draft.kind}
            onChange={(kind) => setDraft((d) => ({ ...d, kind }))}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={fieldLabel}>담당자</span>
            <Input
              aria-label="담당자"
              value={draft.manager}
              placeholder="담당자명"
              onChange={(e) => setDraft((d) => ({ ...d, manager: e.target.value }))}
            />
          </label>
          <label>
            <span className={fieldLabel}>연락처</span>
            <Input
              aria-label="연락처"
              type="tel"
              inputMode="tel"
              value={draft.phone}
              placeholder="031-000-0000"
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </label>
        </div>

        <label>
          <span className={sectionLabel}>메모</span>
          <Textarea
            aria-label="메모"
            rows={2}
            className="mt-1"
            value={draft.memo}
            placeholder="메모를 입력하세요"
            onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
          />
        </label>
      </div>

      <Button full className="mt-4" disabled={!canSave} onClick={handleSave}>
        저장
      </Button>
      {isEdit && contact.active && (
        <div className="mt-2 flex justify-center">
          <ConfirmInline label="비활성" confirmLabel="비활성 처리" onConfirm={handleDeactivate} />
        </div>
      )}
    </Sheet>
  )
}
