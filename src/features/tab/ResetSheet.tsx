import { useMemo, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { Checkbox, ConfirmInline, IconButton, Sheet } from '../../components/ui'
import { useUiStore } from '../../stores/ui'
import { useWorkspaceStore } from '../../stores/workspace'
import type { ResetItem } from '../../types/api/tabState'

/** 초기화 항목 행 정의 — 카운트 단위는 v1 보존(색·이름·메모는 필지, 그룹은 개) */
interface ItemRow {
  key: ResetItem
  label: string
  count: number
  unit: '필지' | '개'
}

/**
 * 초기화 시트 (M-15, v1 ResetSheet 361줄 → 스냅샷 UI 폐기로 축소) —
 * 항목 4종 체크박스(로컬 draft) + ConfirmInline 2단계. 실행 시에만 workspace.reset 커밋.
 * 카운트는 v1 보존: pinned 필지도 포함해 집계한다(보호는 실행 시 reset 액션 소관).
 */
export function ResetSheet() {
  const closeReset = useUiStore((s) => s.closeReset)
  const reset = useWorkspaceStore((s) => s.reset)
  const overrides = useWorkspaceStore((s) => s.overrides)
  const groups = useWorkspaceStore((s) => s.groups)

  // 기본 체크 color·group (v1 useState(['color','group']) 보존)
  const [selected, setSelected] = useState<ResetItem[]>(['color', 'group'])

  const rows = useMemo<ItemRow[]>(() => {
    const values = Object.values(overrides)
    return [
      {
        key: 'color',
        label: '색상/표시 방식',
        count: values.filter((o) => o.color).length,
        unit: '필지',
      },
      {
        key: 'name',
        label: '커스텀 이름',
        count: values.filter((o) => o.name).length,
        unit: '필지',
      },
      { key: 'memo', label: '메모', count: values.filter((o) => o.memo).length, unit: '필지' },
      { key: 'group', label: '그룹', count: Object.keys(groups).length, unit: '개' },
    ]
  }, [overrides, groups])

  const toggle = (key: ResetItem, checked: boolean) =>
    setSelected((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)))

  // 대상 0건(카운트 합 0) 또는 선택 없음이면 실행 불가 (AC-5·AC-7)
  const totalCount = rows.reduce((sum, r) => sum + r.count, 0)
  const disabled = selected.length === 0 || totalCount === 0

  const handleConfirm = () => {
    reset(selected)
    closeReset()
  }

  return (
    <Sheet onClose={closeReset}>
      <header className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw size={16} aria-hidden className="text-ink-muted" />
            <p className="text-xs font-semibold text-ink-muted">초기화 — 탭 내 선택 비우기</p>
          </div>
          <IconButton icon={X} size="sm" aria-label="닫기" onClick={closeReset} />
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          고정(pinned)해 둔 필지는 보호됩니다. 초기화는 되돌릴 수 없습니다.
        </p>
      </header>

      <div className="mb-4 flex flex-col gap-1 rounded-md bg-surface-alt p-3">
        {rows.map((row) => (
          <Checkbox
            key={row.key}
            checked={selected.includes(row.key)}
            onChange={(checked) => toggle(row.key, checked)}
            label={
              <span>
                {row.label}{' '}
                <span className="text-ink-muted">
                  ({row.count}
                  {row.unit})
                </span>
              </span>
            }
          />
        ))}
      </div>

      <ConfirmInline label="초기화" disabled={disabled} onConfirm={handleConfirm} />
    </Sheet>
  )
}
