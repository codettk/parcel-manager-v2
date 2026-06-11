import type { ParcelOverride, ResetItem } from '../../src/types/api/tabState'

/**
 * v1 보존 로직: style은 color가 있을 때만 의미가 있고(없으면 'fill' 보정),
 * icon은 pinned 필지 전용. 빈 문자열은 null로 정규화한다.
 */
export function normalizeOverride(fields: ParcelOverride): ParcelOverride {
  const color = fields.color || null
  const pinned = fields.pinned
  return {
    color,
    style: color ? (fields.style ?? 'fill') : null,
    name: fields.name || null,
    memo: fields.memo || null,
    pinned,
    icon: pinned ? fields.icon || null : null,
  }
}

/** clear 판정 — 모든 의미 필드가 null이고 pinned=false면 행을 삭제한다 (v1 보존) */
export function isClearedOverride(fields: ParcelOverride): boolean {
  return !fields.color && !fields.name && !fields.memo && !fields.icon && !fields.pinned
}

/** reset 항목 → parcel_settings null 패치 (color 초기화는 style도 함께 — v1 보존) */
export function buildResetPatch(items: ResetItem[]): Record<string, null> {
  const patch: Record<string, null> = {}
  if (items.includes('color')) {
    patch.color = null
    patch.style = null
  }
  if (items.includes('name')) patch.name = null
  if (items.includes('memo')) patch.memo = null
  return patch
}
