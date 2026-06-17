import { useEffect } from 'react'
import { Hourglass } from 'lucide-react'

export interface RegionToastProps {
  message: string
  onDismiss: () => void
  /** 자동 사라짐(ms) — 기본 2600 */
  duration?: number
}

/**
 * 하단 토스트 (디자인 zfSwy C-② 준비중 토스트) — "준비 중" 탭 시 안내 (AC-17).
 * 받기·전환 모두 미발생하므로 정보 전달만 한다. 일정 시간 후 자동 dismiss.
 * 전역 Toast 컴포넌트가 없어 region 전용으로 둔다(다른 도메인 재사용 시 ui로 승격 고려).
 */
export function RegionToast({ message, onDismiss, duration = 2600 }: RegionToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration)
    return () => clearTimeout(t)
  }, [onDismiss, duration])

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-5">
      <div
        role="status"
        className="flex items-center gap-2.5 rounded-lg bg-ink px-4 py-3 text-surface shadow-lg"
      >
        <Hourglass className="size-4 shrink-0" aria-hidden />
        <span className="text-[13px] font-semibold">{message}</span>
      </div>
    </div>
  )
}
