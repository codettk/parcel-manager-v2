import { Calculator, X } from 'lucide-react'
import { useUiStore } from '../../stores/ui'

/**
 * 계산기 모드 플로팅 배지 (M-10) — v1 TopBar 배지 대체. NavDrawer/TopBar 도입 시 이전 (명세 §진입점).
 * 모드 중 상시 표시 — 멀티선택 배너(top-3 동일 위치)는 모드 진입 시 해제되므로 충돌 없음
 */
export function CalculatorModeBadge() {
  const exitCalculatorMode = useUiStore((s) => s.exitCalculatorMode)

  return (
    // z-60: 결과 시트(backdrop z-40·패널 z-50)가 열린 동안에도 종료가 탭 가능해야 한다 (명세 §모드 상시 표시)
    <div className="absolute top-3 left-1/2 z-60 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-ink px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap text-surface">
      <Calculator size={14} aria-hidden />
      <span>계산기 모드 — 필지를 탭하세요</span>
      <span className="h-3 w-px bg-surface/40" aria-hidden />
      <button
        type="button"
        className="flex shrink-0 items-center gap-1"
        onClick={exitCalculatorMode}
      >
        종료
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}
