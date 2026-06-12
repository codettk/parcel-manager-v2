// 목록 의미론(행 도출·검색·필터·정렬·중복지번) — v1 ParcelListView 보존.
// 면적순만 픽셀 면적 프록시 → 실면적(lndpclAr) 재설계 (docs/specs/parcel-list.md §판정 상세)
import type { ColorLabel } from '../../types/api/colors'
import type { Group, ParcelOverride } from '../../types/api/tabState'

/** 정적 parcels.json에서 목록이 쓰는 최소 필드 */
export interface ParcelIndexEntry {
  id: string
  jibun: string
}

export interface ListRowData {
  id: string
  jibun: string
  /** override.name 우선, 없으면 jibun (v1 displayName 보존) */
  displayName: string
  /** 그룹 소속이면 그룹 색, 비소속이면 개별 override 색 (v1 보존) */
  colorId: string | null
  groupName: string | null
  /** 공부상 면적 ㎡ — 일괄 API 미수신·null이면 null */
  area: number | null
}

export type ListSortKey = 'jibun' | 'color' | 'area'

/** 색 필터에서 "색 없는 행" 매칭 토큰 (v1 'none' 보존) */
export const COLOR_FILTER_NONE = 'none'

export function buildRows(
  parcels: ParcelIndexEntry[],
  overrides: Record<string, ParcelOverride>,
  groups: Record<string, Group>,
  parcelToGroup: Record<string, string>,
  areas: Record<string, number | null>,
): ListRowData[] {
  return parcels.map((p) => {
    const gid = parcelToGroup[p.id]
    const group = gid !== undefined ? groups[gid] : undefined
    const name = overrides[p.id]?.name
    return {
      id: p.id,
      jibun: p.jibun,
      displayName: name != null && name !== '' ? name : p.jibun,
      colorId: (group !== undefined ? group.color : overrides[p.id]?.color) ?? null,
      groupName: group?.name ?? null,
      area: areas[p.id] ?? null,
    }
  })
}

/** 같은 jibun이 2개 이상 출현하는 jibun 집합 (v1 duplicateJibuns 보존) */
export function findDuplicateJibuns(rows: ListRowData[]): Set<string> {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.jibun, (counts.get(r.jibun) ?? 0) + 1)
  return new Set([...counts].filter(([, n]) => n > 1).map(([jibun]) => jibun))
}

/**
 * 중복지번 식별자 병기 — 커스텀명 없는 행에 한해 `#<id 끝 4자리>` (v1 이슈 #6 수정본 보존).
 * 비대상이면 null
 */
export function duplicateSuffix(row: ListRowData, duplicates: Set<string>): string | null {
  if (row.displayName !== row.jibun) return null
  if (!duplicates.has(row.jibun)) return null
  return `#${row.id.slice(-4)}`
}

/** trim + lowercase includes — displayName·jibun·groupName(null 안전) 3개 필드 (v1 보존) */
export function applySearch(rows: ListRowData[], searchText: string): ListRowData[] {
  const q = searchText.trim().toLowerCase()
  if (q === '') return rows
  return rows.filter(
    (r) =>
      r.displayName.toLowerCase().includes(q) ||
      r.jibun.toLowerCase().includes(q) ||
      (r.groupName !== null && r.groupName.toLowerCase().includes(q)),
  )
}

/** 빈 배열 = 전체. 선택 색 OR 매칭, COLOR_FILTER_NONE은 색 없는 행 매칭 (v1 보존) */
export function applyColorFilter(rows: ListRowData[], colorFilter: string[]): ListRowData[] {
  if (colorFilter.length === 0) return rows
  return rows.filter((r) =>
    r.colorId === null ? colorFilter.includes(COLOR_FILTER_NONE) : colorFilter.includes(r.colorId),
  )
}

export function sortRows(
  rows: ListRowData[],
  sortBy: ListSortKey,
  colorLabels: ColorLabel[],
): ListRowData[] {
  const arr = [...rows]
  const byJibun = (a: ListRowData, b: ListRowData) => a.jibun.localeCompare(b.jibun, 'ko')

  if (sortBy === 'jibun') {
    arr.sort(byJibun)
  } else if (sortBy === 'color') {
    // rank: 팔레트 정의 순서 → 삭제된 색(팔레트 밖) → 미지정 맨 뒤, 동순위 지번순 (v1 colorRank 보존)
    const order = colorLabels.map((c) => c.colorId)
    const rank = (id: string | null): number => {
      if (id === null) return order.length + 1
      const idx = order.indexOf(id)
      return idx >= 0 ? idx : order.length
    }
    arr.sort((a, b) => rank(a.colorId) - rank(b.colorId) || byJibun(a, b))
  } else {
    // 실면적 내림차순, null 맨 뒤 — 동순위·null끼리는 지번순 (재설계 항목)
    arr.sort((a, b) => {
      if (a.area === null && b.area === null) return byJibun(a, b)
      if (a.area === null) return 1
      if (b.area === null) return -1
      return b.area - a.area || byJibun(a, b)
    })
  }
  return arr
}
