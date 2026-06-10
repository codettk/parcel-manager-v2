import { cva } from 'class-variance-authority'

export interface ColorSwatchProps {
  /** DB(color_labels)에서 오는 동적 색상 hex */
  hex: string
  styleMode: 'fill' | 'border'
  selected?: boolean
  size?: 'md' | 'sm'
}

const swatch = cva('inline-block rounded-sm', {
  variants: {
    size: {
      md: 'h-6 w-9',
      sm: 'h-4 w-6',
    },
    styleMode: {
      fill: 'border-[1.5px]',
      border: 'border-[2.5px] bg-surface',
    },
    selected: {
      true: 'ring-2 ring-primary ring-offset-1',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

/** 필지 색상/표시 방식 미리보기 (v1 StylePreview 포팅) */
export function ColorSwatch({ hex, styleMode, selected, size = 'md' }: ColorSwatchProps) {
  return (
    <span
      data-testid="color-swatch"
      className={swatch({ size, styleMode, selected })}
      // CONVENTIONS §4 예외: hex는 DB의 동적 색상이라 토큰화 불가 — 인라인 style 허용
      style={
        styleMode === 'fill'
          ? { backgroundColor: `color-mix(in srgb, ${hex} 55%, transparent)`, borderColor: hex }
          : { borderColor: hex }
      }
    />
  )
}
