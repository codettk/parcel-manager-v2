import { useEffect, useState } from 'react'
import { History, Pencil, RotateCcw, X } from 'lucide-react'
import {
  Button,
  ConfirmInline,
  EmptyState,
  IconButton,
  Input,
  ListRow,
  Sheet,
} from '../../components/ui'
import { useUiStore } from '../../stores/ui'
import { useWorkspaceStore } from '../../stores/workspace'
import type { HistoryItem } from '../../types/api/history'

/** 닫은 시각을 "2026. 6. 16. 14:30" 형태로 — 로케일 한국어 단일 (CONVENTIONS) */
function formatClosedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 닫힌 시각 내림차순 — GET이 이미 정렬하지만 낙관적 복원/이름변경 후에도 안정적으로 정렬 보존 */
function sortByClosedDesc(items: HistoryItem[]): HistoryItem[] {
  return [...items].sort((a, b) => b.closedAt.localeCompare(a.closedAt))
}

/**
 * 히스토리 시트 (M-16) — 닫힌 탭 목록 + 복원/이름변경/삭제.
 * 열릴 때 loadHistory. 행 인라인 편집은 로컬 draft, 삭제는 ConfirmInline 2단계.
 */
export function HistorySheet() {
  const closeHistory = useUiStore((s) => s.closeHistory)
  const history = useWorkspaceStore((s) => s.history)
  const loadHistory = useWorkspaceStore((s) => s.loadHistory)
  const restoreHistory = useWorkspaceStore((s) => s.restoreHistory)
  const renameHistory = useWorkspaceStore((s) => s.renameHistory)
  const deleteHistory = useWorkspaceStore((s) => s.deleteHistory)

  // 인라인 이름 편집 draft — 한 번에 한 행만 (editingId !== null이면 그 행이 input)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    void loadHistory().catch((err: unknown) => {
      if (import.meta.env.DEV) console.error('[history] 목록 로드 실패:', err)
    })
  }, [loadHistory])

  const startEdit = (item: HistoryItem) => {
    setEditingId(item.tabId)
    setDraft(item.name)
  }

  const commitEdit = (tabId: string) => {
    renameHistory(tabId, draft) // 빈 이름은 스토어가 무시
    setEditingId(null)
  }

  const handleRestore = (tabId: string) => {
    void restoreHistory(tabId).catch((err: unknown) => {
      if (import.meta.env.DEV) console.error('[history] 복원 실패:', err)
    })
    closeHistory()
  }

  const sorted = sortByClosedDesc(history)

  return (
    <Sheet onClose={closeHistory}>
      <header className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={16} aria-hidden className="text-ink-muted" />
            <p className="text-xs font-semibold text-ink-muted">히스토리 — 닫힌 작업공간</p>
          </div>
          <IconButton icon={X} size="sm" aria-label="닫기" onClick={closeHistory} />
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          닫은 작업공간을 새 탭으로 복원하거나 이름을 바꾸고 영구히 지웁니다.
        </p>
      </header>

      {sorted.length === 0 ? (
        <EmptyState icon={History} message="닫힌 작업공간이 없습니다." />
      ) : (
        <div className="flex flex-col">
          {sorted.map((item) => {
            const editing = editingId === item.tabId
            return (
              <div key={item.tabId} className="border-b border-border">
                <ListRow
                  title={
                    editing ? (
                      <Input
                        autoFocus
                        aria-label="작업공간 이름 편집"
                        value={draft}
                        maxLength={40}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(item.tabId)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        onBlur={() => commitEdit(item.tabId)}
                      />
                    ) : (
                      item.name
                    )
                  }
                  subtitle={editing ? undefined : formatClosedAt(item.closedAt)}
                />
                {!editing && (
                  <div className="flex items-center justify-end gap-2 px-3 pb-2.5">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(item)}>
                      <Pencil aria-hidden className="size-3.5" />
                      이름 변경
                    </Button>
                    <Button size="sm" onClick={() => handleRestore(item.tabId)}>
                      <RotateCcw aria-hidden className="size-3.5" />
                      복원
                    </Button>
                    <ConfirmInline
                      label="삭제"
                      confirmLabel="영구 삭제"
                      onConfirm={() => deleteHistory(item.tabId)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}
