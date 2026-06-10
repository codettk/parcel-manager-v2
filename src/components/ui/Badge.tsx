import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'

const badge = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4',
  {
    variants: {
      variant: {
        default: 'border border-border bg-surface-alt text-ink-muted',
        primary: 'bg-primary text-surface',
        danger: 'bg-danger text-surface',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {}

export function Badge({ variant, className, ...rest }: BadgeProps) {
  return <span className={badge({ variant, className })} {...rest} />
}
