import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface EmptyStateProps {
  icon?: LucideIcon
  message: ReactNode
  action?: ReactNode
}

/** 빈 상태 표시 (검색 결과 없음 등) */
export function EmptyState({ icon: Icon, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {Icon && <Icon aria-hidden className="size-8 text-parcel-border" />}
      <p className="text-[13px] text-ink-muted">{message}</p>
      {action != null && <div className="mt-1">{action}</div>}
    </div>
  )
}
