import { useEffect, useMemo, useState } from 'react'
import { Building2, Check, ChevronRight, CircleSlash, Search, X } from 'lucide-react'
import { EmptyState, IconButton, Input, Sheet } from '../../../components/ui'
import { useErpStore } from '../../../stores/erp'
import type { Contact, ContactKind } from '../../../types/api/contacts'

/** 거래처 kind 라벨 — 매입/매출/양쪽 (정합 강제 없음 — 표시만, 절충 2) */
const KIND_LABEL: Record<ContactKind, string> = {
  buy: '매입처',
  sell: '매출처',
  both: '매입·매출',
}

export interface ContactPickerSheetProps {
  /** 현재 선택된 거래처 id — null이면 "거래처 미연결" 행이 선택 표시 */
  selectedId: string | null
  /** 거래처 선택(또는 미연결 선택 시 null) — 선택 즉시 시트가 닫힌다 */
  onSelect: (contact: Contact | null) => void
  onClose: () => void
}

/**
 * 거래처 선택 picker (디자인 KtzEM, 슬라이스 5c) — 5b StaffPickerSheet 선례.
 * 5a 활성 거래처 목록 + 이름 검색 + "거래처 미연결" 옵션(절충 2 — 미연결 정상).
 * 매입/매출 정합은 강제하지 않는다(kind는 표시 힌트일 뿐, 절충 2·AC-9).
 */
export function ContactPickerSheet({ selectedId, onSelect, onClose }: ContactPickerSheetProps) {
  const contacts = useErpStore((s) => s.contacts)
  const loadContacts = useErpStore((s) => s.loadContacts)
  const [query, setQuery] = useState('')

  // picker 열 때 단발 fetch (절충 0) — 활성 거래처를 즉시 쓰도록. 실패해도 기존 목록 유지
  useEffect(() => {
    void loadContacts().catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[inventory] 거래처 로드 실패:', err)
    })
  }, [loadContacts])

  const active = useMemo(() => contacts.filter((c) => c.active), [contacts])
  const visible = useMemo(() => {
    const q = query.trim()
    if (q === '') return active
    return active.filter((c) => c.name.includes(q))
  }, [active, query])

  return (
    <Sheet onClose={onClose}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">거래처 선택</h2>
        <IconButton icon={X} size="sm" aria-label="닫기" onClick={onClose} />
      </header>

      <label className="relative mb-3 block">
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
        />
        <Input
          aria-label="거래처 검색"
          value={query}
          placeholder="상호 검색 · 활성 거래처만"
          className="pl-9"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="max-h-[50dvh] overflow-y-auto">
        {/* 거래처 미연결 옵션 — 항상 첫 행(절충 2: 미연결 정상) */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="flex w-full items-center gap-3 border-b border-border px-1 py-2.5 text-left active:bg-surface-alt"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-muted">
            <CircleSlash size={16} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-semibold text-ink">거래처 미연결</span>
            <span className="text-[12px] text-ink-muted">자가 소비·초기 재고 등 (연결 안 함)</span>
          </span>
          {selectedId === null && (
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-pro text-surface" aria-hidden>
              <Check size={14} />
            </span>
          )}
        </button>

        {visible.length === 0 ? (
          <EmptyState icon={Building2} message="활성 거래처가 없어요" />
        ) : (
          visible.map((c) => {
            const picked = selectedId === c.contactId
            return (
              <button
                key={c.contactId}
                type="button"
                onClick={() => onSelect(c)}
                className="flex w-full items-center gap-3 border-b border-border px-1 py-2.5 text-left active:bg-surface-alt"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pro-soft text-pro">
                  <Building2 size={16} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold text-ink">{c.name}</span>
                    <span className="shrink-0 text-[12px] text-ink-muted">{KIND_LABEL[c.kind]}</span>
                  </span>
                  {c.manager !== null && (
                    <span className="text-[12px] text-ink-muted">담당 {c.manager}</span>
                  )}
                </span>
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                    picked ? 'bg-pro text-surface' : 'bg-surface-alt text-ink-muted'
                  }`}
                  aria-hidden
                >
                  {picked ? <Check size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>
            )
          })
        )}
      </div>

      <p className="mt-3 text-center text-[12px] text-ink-muted">
        매입/매출 구분은 거래에 강제하지 않아요 — 어떤 거래처든 연결할 수 있어요
      </p>
    </Sheet>
  )
}
