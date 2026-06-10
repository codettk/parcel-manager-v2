import { cva } from 'class-variance-authority'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

const box = cva(
  'flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
  {
    variants: {
      checked: {
        true: 'border-primary bg-primary text-surface',
        false: 'border-border bg-surface',
      },
    },
  },
)

export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  disabled?: boolean
}

export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <label
      className={[
        'inline-flex min-h-11 items-center gap-2', // 모바일 터치 타깃 최소 44px
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
      ].join(' ')}
    >
      {/* 실제 input은 sr-only로 숨기고 시각 표현은 box span이 담당 (접근성 유지) */}
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span aria-hidden className={box({ checked })}>
        {checked && <Check size={14} strokeWidth={3} />}
      </span>
      {label !== undefined && <span className="text-[14px] text-ink">{label}</span>}
    </label>
  )
}
