import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Building2, Phone, Plus, RotateCcw, Store } from 'lucide-react'
import { Badge, Button, EmptyState, Switch } from '../../components/ui'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Contact, ContactKind } from '../../types/api/contacts'
import { ContactSheet } from './ContactSheet'

const KIND_LABEL: Record<ContactKind, string> = {
  buy: '매입',
  sell: '매출',
  both: '매입·매출',
}

/** 시트 상태 — null=닫힘, 'new'=생성, Contact=편집 */
type SheetState = null | 'new' | Contact

/** 영농 거래처 관리 풀스크린 뷰 (슬라이스 5a) — 인력 뷰 동형 */
export function ContactsView() {
  const close = useUiStore((s) => s.closeContactsView)
  const contacts = useErpStore((s) => s.contacts)
  const includeInactive = useErpStore((s) => s.includeInactive)
  const setIncludeInactive = useErpStore((s) => s.setIncludeInactive)
  const loadContacts = useErpStore((s) => s.loadContacts)
  const updateContact = useErpStore((s) => s.updateContact)

  useEffect(() => {
    void loadContacts().catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[erp] 거래처 로드 실패:', err)
    })
  }, [loadContacts])

  const [sheet, setSheet] = useState<SheetState>(null)

  const activeCount = useMemo(() => contacts.filter((c) => c.active).length, [contacts])
  const inactiveCount = contacts.length - activeCount
  const visible = useMemo(
    () => (includeInactive ? contacts : contacts.filter((c) => c.active)),
    [contacts, includeInactive],
  )

  const reactivate = (c: Contact) => updateContact(c.contactId, { active: true })

  return (
    <div data-testid="contacts-view" className="absolute inset-0 z-30 flex flex-col bg-surface">
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
          <h1 className="text-[17px] font-bold text-ink">거래처 관리</h1>
          <p className="text-[12px] text-ink-muted">
            활성 {activeCount}곳
            {includeInactive && inactiveCount > 0 && ` · 비활성 ${inactiveCount}곳`}
          </p>
        </div>
        <Button size="sm" onClick={() => setSheet('new')}>
          <Plus size={15} aria-hidden />
          추가
        </Button>
      </div>

      <div className="flex items-center justify-between border-b border-border px-4 pb-2">
        <span className="text-[13px] text-ink-muted">비활성 포함 보기</span>
        <Switch checked={includeInactive} onChange={setIncludeInactive} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <EmptyState
            icon={Store}
            message="등록된 거래처가 없어요"
            action={
              <Button size="sm" onClick={() => setSheet('new')}>
                <Plus size={15} aria-hidden />
                거래처 추가
              </Button>
            }
          />
        ) : (
          visible.map((c) => (
            <ContactRow
              key={c.contactId}
              contact={c}
              onEdit={() => setSheet(c)}
              onReactivate={() => reactivate(c)}
            />
          ))
        )}
      </div>

      {sheet !== null && (
        <ContactSheet
          contact={sheet === 'new' ? undefined : sheet}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

interface ContactRowProps {
  contact: Contact
  onEdit: () => void
  onReactivate: () => void
}

function ContactRow({ contact, onEdit, onReactivate }: ContactRowProps) {
  return (
    <div
      className={`flex items-center gap-3 border-b border-border px-3 py-2.5 ${
        contact.active ? '' : 'opacity-60'
      }`}
    >
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pro-soft text-pro">
          <Building2 size={16} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-ink">{contact.name}</span>
            <Badge className="shrink-0">{KIND_LABEL[contact.kind]}</Badge>
          </span>
          <span className="flex items-center gap-2 text-[12px] text-ink-muted">
            {contact.manager !== null && <span className="truncate">담당 {contact.manager}</span>}
            {contact.phone !== null && (
              <span className="flex shrink-0 items-center gap-1">
                <Phone size={11} aria-hidden />
                {contact.phone}
              </span>
            )}
          </span>
        </span>
      </button>
      {!contact.active && (
        <Button size="sm" variant="secondary" onClick={onReactivate}>
          <RotateCcw size={13} aria-hidden />
          재활성화
        </Button>
      )}
    </div>
  )
}
