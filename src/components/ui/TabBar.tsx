import { cva } from 'class-variance-authority'
import { Plus, X } from 'lucide-react'
import { useState, type KeyboardEvent, type TouchEvent } from 'react'

const tab = cva(
  'group flex h-9 shrink-0 cursor-pointer select-none items-center gap-1 rounded-sm pl-3 pr-1.5 text-[13px] transition-colors',
  {
    variants: {
      active: {
        true: 'bg-surface-alt font-semibold text-primary',
        false: 'text-ink-muted active:bg-surface-alt',
      },
    },
  },
)

export interface TabBarTab {
  id: string
  name: string
}

export interface TabBarProps {
  tabs: TabBarTab[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onRename: (id: string, name: string) => void
}

/** 탭 작업공간 바 — 순수 프레젠테이션. 마지막 탭 보호 등 비즈니스 규칙은 상위 소관 */
export function TabBar({ tabs, activeId, onSelect, onAdd, onClose, onRename }: TabBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startEdit = (t: TabBarTab) => {
    setEditingId(t.id)
    setDraft(t.name)
  }

  const commitEdit = (id: string) => {
    const name = draft.trim()
    if (name) onRename(id, name)
    setEditingId(null)
  }

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === 'Enter') commitEdit(id)
    if (e.key === 'Escape') setEditingId(null)
  }

  // 탭 바 가로 스크롤이 지도 팬으로 전파되지 않도록 차단 (v1 계획서 M-5)
  const stopTouch = (e: TouchEvent) => e.stopPropagation()

  return (
    <div
      role="tablist"
      className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1"
      onTouchStart={stopTouch}
      onTouchMove={stopTouch}
    >
      {tabs.map((t) => {
        const active = t.id === activeId
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={active}
            className={tab({ active })}
            onClick={() => {
              if (!active) onSelect(t.id)
            }}
            onDoubleClick={() => {
              if (active) startEdit(t)
            }}
          >
            {editingId === t.id ? (
              <input
                // 편집 진입 시 즉시 입력 가능해야 함
                autoFocus
                aria-label="탭 이름 편집"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => handleEditKeyDown(e, t.id)}
                onBlur={() => commitEdit(t.id)}
                className="h-6 w-24 rounded-sm border border-border bg-surface px-1 text-[13px] text-ink outline-none"
              />
            ) : (
              <span className="max-w-32 truncate">{t.name}</span>
            )}
            <button
              type="button"
              aria-label={`${t.name} 닫기`}
              className="rounded-full p-1 text-ink-muted transition-colors active:bg-border"
              onClick={(e) => {
                e.stopPropagation()
                onClose(t.id)
              }}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        aria-label="탭 추가"
        className="flex size-9 shrink-0 items-center justify-center rounded-sm text-ink-muted transition-colors active:bg-surface-alt"
        onClick={onAdd}
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  )
}
