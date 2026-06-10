import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'

const track = cva('relative h-6 w-10 shrink-0 rounded-full transition-colors', {
  variants: {
    checked: {
      true: 'bg-primary',
      false: 'bg-border',
    },
  },
})

const knob = cva('absolute top-0.5 left-0.5 size-5 rounded-full bg-surface transition-transform', {
  variants: {
    checked: {
      true: 'translate-x-4',
      false: 'translate-x-0',
    },
  },
})

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className="inline-flex min-h-11 items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40" // 모바일 터치 타깃 최소 44px
      onClick={() => onChange(!checked)}
    >
      {label !== undefined && <span className="text-[14px] text-ink">{label}</span>}
      <span aria-hidden className={track({ checked })}>
        <span className={knob({ checked })} />
      </span>
    </button>
  )
}
