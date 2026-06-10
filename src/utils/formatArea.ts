// v1 constants.js AREA_UNITS/convertArea 포팅 — 검증된 로직 보존 (명세서 M-1 인접)
export type AreaUnitId = 'm2' | 'pyeong' | 'a' | 'ha'

export interface AreaUnit {
  id: AreaUnitId
  label: string
  convert: (m2: number) => number
  format: (value: number) => string
}

export const AREA_UNITS: AreaUnit[] = [
  {
    id: 'm2',
    label: '㎡',
    convert: (v) => v,
    format: (v) => v.toLocaleString('ko', { maximumFractionDigits: 1 }) + ' ㎡',
  },
  {
    id: 'pyeong',
    label: '평',
    convert: (v) => v * 0.3025,
    format: (v) => v.toLocaleString('ko', { maximumFractionDigits: 1 }) + ' 평',
  },
  {
    id: 'a',
    label: 'a',
    convert: (v) => v / 100,
    format: (v) => v.toLocaleString('ko', { maximumFractionDigits: 2 }) + ' a',
  },
  {
    id: 'ha',
    label: 'ha',
    convert: (v) => v / 10000,
    format: (v) => v.toFixed(4) + ' ha',
  },
]

/** ㎡ 값을 지정 단위로 환산해 표시 문자열로 변환 */
export function formatArea(m2: number, unitId: AreaUnitId = 'm2'): string {
  const unit = AREA_UNITS.find((u) => u.id === unitId) ?? AREA_UNITS[0]
  return unit.format(unit.convert(m2))
}
