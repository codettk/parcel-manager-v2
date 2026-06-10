import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

const button = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-surface active:brightness-90',
        danger: 'bg-danger text-surface active:brightness-90',
        secondary: 'border border-border bg-surface text-ink active:bg-surface-alt',
        ghost: 'bg-transparent text-ink-muted active:bg-surface-alt',
      },
      size: {
        md: 'h-11 px-4 text-[15px]',
        sm: 'h-8 px-3 text-[13px]',
      },
      full: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}

export function Button({ variant, size, full, className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={button({ variant, size, full, className })}
      {...rest}
    />
  )
}
