import { type ReactNode } from 'react'

export interface SidePanelProps {
  onClose: () => void
  children: ReactNode
}

/** 데스크탑(≥720px)용 우측 패널 — 모바일 BottomSheet의 와이드 대응 (v1 sheetPanel 스타일 계승) */
export function SidePanel({ onClose, children }: SidePanelProps) {
  return (
    <>
      <div
        data-testid="sheet-backdrop"
        className="fixed inset-0 z-40 bg-ink/20"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-50 w-[360px] overflow-y-auto border-l border-border bg-surface p-4 shadow-[-4px_0_24px_rgb(0_0_0/0.1)]"
      >
        {children}
      </div>
    </>
  )
}
