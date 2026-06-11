import { Button } from '../../components/ui'
import { useUiStore } from '../../stores/ui'

/** 추가모드 오버레이 — 안내 배너 + 완료 버튼 (명세 ⑤). 탭 처리(즉시 upsertGroup)는 ui.tapParcel 소관 */
export function AddToGroupBanner() {
  const finishAddToGroupMode = useUiStore((s) => s.finishAddToGroupMode)

  return (
    <>
      <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap text-surface">
        추가할 필지를 탭하세요 (탭 재선택 시 제거)
      </div>
      {/* 공통 Button은 rounded-md 고정 — 래퍼 클립으로 pill 형태 (줌 컨트롤 선례) */}
      <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 overflow-hidden rounded-full shadow-lg">
        <Button className="px-8" onClick={finishAddToGroupMode}>
          완료
        </Button>
      </div>
    </>
  )
}
