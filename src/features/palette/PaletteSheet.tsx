import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button, ColorPicker, IconButton, Input, Sheet } from '../../components/ui'
import { useUiStore } from '../../stores/ui'
import { useWorkspaceStore } from '../../stores/workspace'
import { buildDeleteWarning, countColorRefs } from './colorRefs'
import { NEW_COLOR_HEX, NEW_COLOR_LABEL } from './paletteDefaults'

/** draft 행 — sortOrder는 저장 시 행 인덱스로 재부여되므로 draft에서 들고 다니지 않는다 */
interface ColorDraft {
  colorId: string
  label: string
  hex: string
}

/**
 * 색상 팔레트 설정 시트 (M-11, v1 SettingsSheet 재조립) —
 * draft 일괄 저장: 편집·삭제 마크는 로컬 누적, "저장"에서만 API 반영. X/backdrop = 폐기
 */
export function PaletteSheet() {
  const closePalette = useUiStore((s) => s.closePalette)
  const saveColors = useWorkspaceStore((s) => s.saveColors)
  const deleteColorAndCleanup = useWorkspaceStore((s) => s.deleteColorAndCleanup)
  const overrides = useWorkspaceStore((s) => s.overrides)
  const groups = useWorkspaceStore((s) => s.groups)

  // 마운트(시트 열림) 시 1회 복사 — colors는 Realtime refetch로 항상 최신이라 재조회하지 않는다 (명세 §폐기)
  const [drafts, setDrafts] = useState<ColorDraft[]>(() =>
    useWorkspaceStore
      .getState()
      .colorLabels.map(({ colorId, label, hex }) => ({ colorId, label, hex })),
  )
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  // 2단계 인라인 확인 (ConfirmInline 패턴) — 1탭은 행 확장 확인 UI, 2탭째 실행
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const update = (colorId: string, patch: Partial<ColorDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.colorId === colorId ? { ...d, ...patch } : d)))

  const addColor = () =>
    setDrafts((prev) => [
      ...prev,
      { colorId: crypto.randomUUID(), label: NEW_COLOR_LABEL, hex: NEW_COLOR_HEX },
    ])

  /** 확인 탭 — draft에서 행 제거 + 삭제 마크. API는 "저장"까지 미호출 */
  const confirmDelete = (colorId: string) => {
    setDrafts((prev) => prev.filter((d) => d.colorId !== colorId))
    setDeletedIds((prev) => [...prev, colorId])
    setConfirmingId(null)
  }

  const handleSave = () => {
    // 삭제 마크 DELETE들 먼저 → 남은 색 전체 PUT — upsert가 삭제된 색을 되살리지 않는 순서 (v1 handleSave 보존)
    for (const id of deletedIds) deleteColorAndCleanup(id)
    saveColors(drafts.map((d, i) => ({ ...d, sortOrder: i })))
    closePalette()
  }

  const hasEmptyLabel = drafts.some((d) => d.label.trim() === '')

  return (
    <Sheet onClose={closePalette}>
      <header className="mb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-muted">색상 팔레트</p>
          <IconButton icon={X} size="sm" aria-label="닫기" onClick={closePalette} />
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          색 이름과 색상을 편집합니다 · 모든 작업공간에 적용
        </p>
      </header>

      {drafts.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {drafts.map((d) => {
            const confirming = confirmingId === d.colorId
            const warning = confirming
              ? buildDeleteWarning(countColorRefs(overrides, groups, d.colorId))
              : null
            return (
              <div
                key={d.colorId}
                className={confirming ? 'flex flex-col gap-2 rounded-md bg-surface-alt p-2' : ''}
              >
                <div className="flex items-center gap-2">
                  <ColorPicker
                    aria-label="색상 선택"
                    value={d.hex}
                    onChange={(hex) => update(d.colorId, { hex })}
                  />
                  <Input
                    aria-label="색상 이름"
                    placeholder="색상 이름"
                    maxLength={12}
                    value={d.label}
                    onChange={(e) => update(d.colorId, { label: e.target.value })}
                  />
                  <IconButton
                    icon={Trash2}
                    aria-label="색상 삭제"
                    className="shrink-0"
                    onClick={() => setConfirmingId(confirming ? null : d.colorId)}
                  />
                </div>
                {confirming && (
                  <>
                    {warning !== null && <p className="text-xs text-danger">{warning}</p>}
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setConfirmingId(null)}>
                        취소
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => confirmDelete(d.colorId)}>
                        삭제
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Button variant="secondary" full onClick={addColor}>
        + 색상 추가
      </Button>
      <Button full className="mt-4" disabled={hasEmptyLabel} onClick={handleSave}>
        저장
      </Button>
    </Sheet>
  )
}
