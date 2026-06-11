import { type ReactNode } from 'react'

export interface SidePanelProps {
  children: ReactNode
}

/**
 * 데스크탑(≥720px)용 우측 패널 — 모바일 BottomSheet의 와이드 대응 (v1 sheetPanel 스타일 계승).
 * 비모달: backdrop 없음 — 패널이 열린 채 지도 탭·팬/줌이 가능해야 한다 (v1 와이드 동작 보존).
 * 닫기는 시트 콘텐츠의 닫기 버튼 소관.
 */
export function SidePanel({ children }: SidePanelProps) {
  return (
    <div
      role="dialog"
      className="fixed inset-y-0 right-0 z-50 w-[360px] overflow-y-auto border-l border-border bg-surface p-4 shadow-[-4px_0_24px_rgb(0_0_0/0.1)]"
    >
      {children}
    </div>
  )
}
