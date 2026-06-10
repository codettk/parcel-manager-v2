import { useState, type ReactNode } from 'react'
import { Button } from './Button'

export interface ConfirmInlineProps {
  label: ReactNode
  confirmLabel?: ReactNode
  onConfirm: () => void
  disabled?: boolean
}

/** 2단계 인라인 확인 — 트리거 클릭 후 취소/실행 쌍으로 교체 (v1 ResetSheet 검증 UX) */
export function ConfirmInline({
  label,
  confirmLabel = '실행',
  onConfirm,
  disabled,
}: ConfirmInlineProps) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <Button variant="danger" disabled={disabled} onClick={() => setArmed(true)}>
        {label}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={() => setArmed(false)}>
        취소
      </Button>
      <Button
        variant="danger"
        disabled={disabled}
        onClick={() => {
          setArmed(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  )
}
