import { type ReactNode } from 'react'
import { useIsWide } from '../../hooks/useIsWide'
import { BottomSheet } from './BottomSheet'
import { SidePanel } from './SidePanel'

export interface SheetProps {
  onClose: () => void
  children: ReactNode
}

/**
 * 뷰포트에 따라 BottomSheet(모바일)/SidePanel(≥720px)을 자동 선택 — v1의 시트별 수동 분기 제거.
 * onClose는 모바일 backdrop 탭에만 사용 — 와이드 SidePanel은 비모달이라 backdrop 닫기가 없다.
 */
export function Sheet({ onClose, children }: SheetProps) {
  const isWide = useIsWide()
  if (isWide) return <SidePanel>{children}</SidePanel>
  return <BottomSheet onClose={onClose}>{children}</BottomSheet>
}
