import { type ReactNode } from 'react'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

/** 좌측 슬라이드 내비게이션 드로어 (v1 NavDrawer 계승) */
export function Drawer({ open, onClose, children }: DrawerProps) {
  if (!open) return null
  return (
    <>
      <div
        data-testid="drawer-backdrop"
        className="fixed inset-0 z-40 bg-ink/35"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 left-0 z-50 w-[300px] max-w-[85vw] overflow-y-auto bg-surface pb-[max(16px,env(safe-area-inset-bottom))] shadow-[4px_0_24px_rgb(0_0_0/0.15)]"
      >
        {children}
      </div>
    </>
  )
}

export interface DrawerSectionProps {
  title: string
  children: ReactNode
}

/** 드로어 메뉴 섹션 — 제목 + 아이템 목록 (v2.1 메뉴 재편 대비) */
export function DrawerSection({ title, children }: DrawerSectionProps) {
  return (
    <section>
      <h2 className="px-4 pb-1 pt-4 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}
