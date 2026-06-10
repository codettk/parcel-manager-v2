import { useCallback, useEffect, useRef, type ReactNode } from 'react'

export interface BottomSheetProps {
  onClose: () => void
  children: ReactNode
}

/** 모바일 바텀시트. 열린 직후 400ms 이내 onClose 무시 — 탭 이벤트가 backdrop까지 전파되어 즉시 닫히는 모바일 버그 방지 (v1 검증 패턴) */
export function BottomSheet({ onClose, children }: BottomSheetProps) {
  const mountedAt = useRef(0)

  useEffect(() => {
    mountedAt.current = Date.now()
  }, [])

  const handleClose = useCallback(() => {
    if (!mountedAt.current || Date.now() - mountedAt.current < 400) return
    onClose()
  }, [onClose])

  return (
    <>
      <div
        data-testid="sheet-backdrop"
        className="fixed inset-0 z-40 bg-ink/35"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-lg bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_24px_rgb(0_0_0/0.15)]"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border" />
        {children}
      </div>
    </>
  )
}
