import { cva } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

const chip = cva(
  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
  {
    variants: {
      selected: {
        true: 'border-primary bg-primary text-surface',
        false: 'border-border bg-surface text-ink active:bg-surface-alt',
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
)

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  /** 지정 시 왼쪽에 색 점 표시 (색상 필터용) */
  colorHex?: string
}

export function Chip({ selected, colorHex, className, type, children, ...rest }: ChipProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-pressed={selected ?? false}
      className={chip({ selected, className })}
      {...rest}
    >
      {colorHex && (
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          // DB(color_labels)에서 오는 동적 색상이라 토큰화 불가 — 인라인 style 허용 (CONVENTIONS §4 예외)
          style={{ backgroundColor: colorHex }}
        />
      )}
      {children}
    </button>
  )
}
