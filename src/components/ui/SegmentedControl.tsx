import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'

const segment = cva('flex-1 rounded-sm font-medium transition-colors', {
  variants: {
    size: {
      md: 'h-10 px-3 text-[14px]', // 컨테이너 패딩 포함 44px 터치 타깃
      sm: 'h-7 px-2.5 text-[12px]',
    },
    selected: {
      true: 'bg-primary text-surface',
      false: 'bg-transparent text-ink-muted active:bg-surface-alt',
    },
  },
  defaultVariants: {
    size: 'md',
    selected: false,
  },
})

export interface SegmentedControlProps<T extends string> {
  options: { id: T; label: ReactNode }[]
  value: T
  onChange: (id: T) => void
  size?: 'md' | 'sm'
  className?: string
}

/** 면적단위(㎡/평/a/ha)·fill/border·정렬 등 단일 선택 토글 공용 컴포넌트 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      className={['inline-flex rounded-md border border-border bg-surface p-0.5', className]
        .filter(Boolean)
        .join(' ')}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          className={segment({ size, selected: option.id === value })}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
