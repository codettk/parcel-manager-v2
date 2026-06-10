import type { ReactNode } from 'react'

export interface ListRowProps {
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
}

/** 목록 행 (필지 목록·그룹 멤버 공용). onClick 유무에 따라 button/div로 렌더 */
export function ListRow({ title, subtitle, leading, trailing, onClick }: ListRowProps) {
  const content = (
    <>
      {leading != null && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-medium text-ink">{title}</span>
        {subtitle != null && (
          <span className="truncate text-[12px] text-ink-muted">{subtitle}</span>
        )}
      </span>
      {trailing != null && <span className="flex shrink-0 items-center">{trailing}</span>}
    </>
  )

  const rowClass =
    'flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left odd:bg-surface even:bg-surface-alt'

  if (onClick) {
    return (
      <button type="button" className={`${rowClass} active:bg-surface-alt`} onClick={onClick}>
        {content}
      </button>
    )
  }
  return <div className={rowClass}>{content}</div>
}
