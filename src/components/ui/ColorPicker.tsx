import { cva } from 'class-variance-authority'
import type { InputHTMLAttributes } from 'react'

const colorPicker = cva(
  'size-8 shrink-0 cursor-pointer rounded-sm border border-border bg-surface p-0.5 transition-colors focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-40',
)

export interface ColorPickerProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> {
  /** #rrggbb — 호출부 소관의 동적 색상값 (도메인 무지: hex 문자열 in/out) */
  value: string
  onChange: (hex: string) => void
  'aria-label': string // 텍스트 없는 컨트롤이므로 접근성 라벨 필수
}

/** 네이티브 <input type="color"> 래퍼 — 모바일 OS 피커·의존성 0, 32px 스와치 (v1 SettingsSheet 행 보존) */
export function ColorPicker({ value, onChange, className, ...rest }: ColorPickerProps) {
  return (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={colorPicker({ className })}
      {...rest}
    />
  )
}
