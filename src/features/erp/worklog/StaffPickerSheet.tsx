import { useMemo, useState } from 'react'
import { Check, Plus, Search, UserRound, X } from 'lucide-react'
import { EmptyState, IconButton, Input, Sheet } from '../../../components/ui'
import { useErpStore } from '../../../stores/erp'
import type { Staff } from '../../../types/api/staff'
import { formatWon } from './draft'

export interface StaffPickerSheetProps {
  /** 이미 라인에 들어간 staffId 집합 — 다중 선택 누적의 현재 상태 */
  selectedIds: string[]
  /** 인력 추가 — 선택 시 기본 일당 자동채움은 호출부(WorkLogSheet)가 dailyWage로 수행 */
  onAdd: (staff: Staff) => void
  /** 이미 추가된 인력 다시 탭 = 제거(토글) */
  onRemove: (staffId: string) => void
  onClose: () => void
}

/**
 * 인력 선택 picker (디자인 p8OAc) — 5a 활성 인력 목록 + 이름 검색.
 * 선택 시 호출부가 기본 dailyWage를 라인에 자동채운다(AC-14). 비활성 인력은 제외(절충 2).
 */
export function StaffPickerSheet({ selectedIds, onAdd, onRemove, onClose }: StaffPickerSheetProps) {
  const staff = useErpStore((s) => s.staff)
  const [query, setQuery] = useState('')

  const active = useMemo(() => staff.filter((s) => s.active), [staff])
  const visible = useMemo(() => {
    const q = query.trim()
    if (q === '') return active
    return active.filter((s) => s.name.includes(q))
  }, [active, query])

  return (
    <Sheet onClose={onClose}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">인력 선택</h2>
        <IconButton icon={X} size="sm" aria-label="닫기" onClick={onClose} />
      </header>

      <label className="relative mb-3 block">
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
        />
        <Input
          aria-label="인력 검색"
          value={query}
          placeholder="이름 검색 · 활성 인력만"
          className="pl-9"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="max-h-[50dvh] overflow-y-auto">
        {visible.length === 0 ? (
          <EmptyState icon={UserRound} message="활성 인력이 없어요" />
        ) : (
          visible.map((s) => {
            const picked = selectedIds.includes(s.staffId)
            return (
              <button
                key={s.staffId}
                type="button"
                onClick={() => (picked ? onRemove(s.staffId) : onAdd(s))}
                className="flex w-full items-center gap-3 border-b border-border px-1 py-2.5 text-left active:bg-surface-alt"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pro-soft text-pro">
                  <UserRound size={16} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold text-ink">{s.name}</span>
                    {s.role !== null && (
                      <span className="shrink-0 text-[12px] text-ink-muted">{s.role}</span>
                    )}
                  </span>
                  <span className="text-[12px] text-ink-muted">
                    기본 {s.dailyWage !== null ? formatWon(s.dailyWage) : '미설정'}
                  </span>
                </span>
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                    picked ? 'bg-pro text-surface' : 'bg-surface-alt text-ink-muted'
                  }`}
                  aria-hidden
                >
                  {picked ? <Check size={14} /> : <Plus size={14} />}
                </span>
              </button>
            )
          })
        )}
      </div>

      <p className="mt-3 text-center text-[12px] text-ink-muted">
        선택하면 그 인력의 기본 일당이 라인에 자동 채워져요
      </p>
    </Sheet>
  )
}
