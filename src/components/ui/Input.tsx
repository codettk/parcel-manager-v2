import { cva, type VariantProps } from 'class-variance-authority'
import type { InputHTMLAttributes } from 'react'

const input = cva(
  'h-11 w-full rounded-sm border border-border bg-surface px-3 text-[15px] text-ink transition-colors placeholder:text-ink-muted focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'font-sans',
        numeric: 'font-mono', // 면적·지번 등 숫자 표기
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface InputProps
  extends InputHTMLAttributes<HTMLInputElement>, VariantProps<typeof input> {}

export function Input({ variant, className, ...rest }: InputProps) {
  return (
    <input
      // numeric은 decimal 키패드 — 값은 문자열 draft로 보관해 소수점 입력 중간 상태 보존 (CONVENTIONS §3)
      inputMode={variant === 'numeric' ? 'decimal' : undefined}
      className={input({ variant, className })}
      {...rest}
    />
  )
}
