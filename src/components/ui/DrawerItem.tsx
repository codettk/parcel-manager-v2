import { cva } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

const item = cva(
  'flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] transition-colors active:bg-surface-alt',
  {
    variants: {
      active: {
        true: 'bg-surface-alt font-semibold text-primary',
        false: 'text-ink',
      },
    },
    defaultVariants: {
      active: false,
    },
  },
)

export interface DrawerItemProps {
  icon?: LucideIcon
  label: ReactNode
  onClick: () => void
  active?: boolean
  trailing?: ReactNode
}

/** 드로어 메뉴 아이템 (v1 DrawerItem 계승) */
export function DrawerItem({ icon: Icon, label, onClick, active, trailing }: DrawerItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={item({ active })}
    >
      {Icon && <Icon aria-hidden className="size-[18px] shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing && <span className="shrink-0 text-[13px] text-ink-muted">{trailing}</span>}
    </button>
  )
}
