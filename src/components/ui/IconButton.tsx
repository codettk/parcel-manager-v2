import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

const iconButton = cva(
  'inline-flex items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40',
  {
    variants: {
      variant: {
        ghost: 'bg-transparent text-ink-muted active:bg-surface-alt',
        solid: 'bg-primary text-surface active:brightness-90',
      },
      size: {
        md: 'size-11', // 모바일 터치 타깃 최소 44px
        sm: 'size-8',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
    },
  },
)

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButton> {
  icon: LucideIcon
  'aria-label': string // 텍스트 없는 버튼이므로 접근성 라벨 필수
}

export function IconButton({
  icon: Icon,
  variant,
  size,
  className,
  type,
  ...rest
}: IconButtonProps) {
  return (
    <button type={type ?? 'button'} className={iconButton({ variant, size, className })} {...rest}>
      <Icon size={size === 'sm' ? 16 : 20} aria-hidden />
    </button>
  )
}
