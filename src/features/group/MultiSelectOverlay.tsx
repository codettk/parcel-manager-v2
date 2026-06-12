import { Layers } from 'lucide-react'
import { Button, IconButton } from '../../components/ui'
import { useUiStore } from '../../stores/ui'
import { useWorkspaceStore } from '../../stores/workspace'

/** 지도 위 멀티선택 오버레이 — 토글 버튼·안내 배너·"그룹 만들기" FAB (명세 ①·②) */
export function MultiSelectOverlay() {
  const multiSelectMode = useUiStore((s) => s.multiSelectMode)
  const multiSelectedIds = useUiStore((s) => s.multiSelectedIds)
  const openSheet = useUiStore((s) => s.openSheet)
  const addToGroupModeGroupId = useUiStore((s) => s.addToGroupModeGroupId)
  const calculatorActive = useUiStore((s) => s.calculatorActive)
  const toggleMultiSelectMode = useUiStore((s) => s.toggleMultiSelectMode)
  const beginGroupDraft = useWorkspaceStore((s) => s.beginGroupDraft)

  const count = multiSelectedIds.length
  // 시트 열림·추가모드 중에는 토글 버튼 숨김 (v1 `!addToGroupMode && !selected && !selectedGroupId` 보존).
  // 계산기 모드(M-10) 중에도 숨김 — tapParcel이 계산기 분기로 멀티선택을 우회하므로 모드 충돌 차단
  const showToggle = openSheet === null && addToGroupModeGroupId === null && !calculatorActive

  return (
    <>
      {showToggle && (
        <div className="absolute top-16 right-3 z-10 overflow-hidden rounded-md bg-surface shadow-md">
          <IconButton
            icon={Layers}
            variant={multiSelectMode ? 'solid' : 'ghost'}
            aria-label="그룹 선택 모드"
            aria-pressed={multiSelectMode}
            onClick={toggleMultiSelectMode}
          />
        </div>
      )}
      {multiSelectMode && (
        <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-3.5 py-2 text-[13px] whitespace-nowrap text-surface">
          <span className="font-semibold">
            {count === 0 ? '묶을 필지를 탭해서 선택하세요' : `${count}개 선택됨`}
          </span>
          <span className="h-3 w-px bg-surface/40" aria-hidden />
          <button type="button" className="shrink-0" onClick={toggleMultiSelectMode}>
            취소
          </button>
        </div>
      )}
      {multiSelectMode && count >= 2 && (
        // 공통 Button은 rounded-md 고정 — 래퍼 클립으로 pill 형태 (줌 컨트롤 선례)
        <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 overflow-hidden rounded-full shadow-lg">
          <Button className="px-6" onClick={() => beginGroupDraft(multiSelectedIds)}>
            그룹 만들기 ({count}필지)
          </Button>
        </div>
      )}
    </>
  )
}
