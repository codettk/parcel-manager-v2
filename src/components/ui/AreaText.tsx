import { formatArea, type AreaUnitId } from '../../utils/formatArea'

export interface AreaTextProps {
  m2: number
  unit?: AreaUnitId
}

/** 면적 표시 — 숫자 정렬을 위해 mono + tabular-nums */
export function AreaText({ m2, unit = 'm2' }: AreaTextProps) {
  return <span className="font-mono tabular-nums">{formatArea(m2, unit)}</span>
}
