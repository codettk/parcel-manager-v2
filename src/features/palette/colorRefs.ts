import type { Group, ParcelOverride } from '../../types/api/tabState'

export interface ColorRefCount {
  parcels: number
  groups: number
}

/**
 * 현재 탭에서 colorId를 참조하는 필지/그룹 수 — 전 탭 참조 수는 클라이언트가 알 수 없어
 * 현재 탭 기준으로 집계하고 문구에 전 탭 영향을 고지한다 (명세 §판정 — 참조 수 산정 재설계)
 */
export function countColorRefs(
  overrides: Record<string, ParcelOverride>,
  groups: Record<string, Group>,
  colorId: string,
): ColorRefCount {
  return {
    parcels: Object.values(overrides).filter((o) => o.color === colorId).length,
    groups: Object.values(groups).filter((g) => g.color === colorId).length,
  }
}

/** 삭제 확인 경고 문구 — 참조가 전혀 없으면 null (경고 없이 확인 버튼만) */
export function buildDeleteWarning(refs: ColorRefCount): string | null {
  const parts: string[] = []
  if (refs.parcels > 0) parts.push(`필지 ${refs.parcels}개`)
  if (refs.groups > 0) parts.push(`그룹 ${refs.groups}개`)
  if (parts.length === 0) return null
  return `${parts.join('·')}가 색상 없음으로 변경됩니다 (모든 탭 적용)`
}
