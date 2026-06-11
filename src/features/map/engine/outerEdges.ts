import type { Point } from '../../../utils/geo'

export type Edge = [Point, Point]

interface EdgeSource {
  id: string
  poly: Point[]
}

/**
 * 그룹 멤버 폴리곤들의 외곽 변 계산 (v1 computeOuterEdges 동작 보존).
 * 변을 toFixed(6) 키로 카운트해 등장 1회인 변(=공유되지 않은 변)만 반환한다.
 */
export function computeOuterEdges(parcels: readonly { poly: Point[] }[]): Edge[] {
  const counts = new Map<string, number>()
  const first = new Map<string, Edge>()
  for (const p of parcels) {
    for (let i = 0; i < p.poly.length; i++) {
      const p1 = p.poly[i]
      const p2 = p.poly[(i + 1) % p.poly.length]
      const a = p1[0].toFixed(6) + ',' + p1[1].toFixed(6)
      const b = p2[0].toFixed(6) + ',' + p2[1].toFixed(6)
      const key = a < b ? a + '|' + b : b + '|' + a
      counts.set(key, (counts.get(key) ?? 0) + 1)
      if (!first.has(key)) first.set(key, [p1, p2])
    }
  }
  const outer: Edge[] = []
  counts.forEach((cnt, key) => {
    if (cnt === 1) {
      const edge = first.get(key)
      if (edge) outer.push(edge)
    }
  })
  return outer
}

/**
 * 그룹별 외곽 변 캐시 (성능 개선 ① — v1은 팬/줌마다 전 그룹 재계산).
 * 멤버 구성(parcelIds 순서 포함)이 같으면 재계산하지 않는다.
 * 외곽 변은 데이터 좌표라 viewport 변경에 불변 — 팬/줌은 항상 캐시 히트.
 */
export interface OuterEdgesCache {
  get(groupId: string, members: readonly EdgeSource[]): Edge[]
  /** 사라진 그룹의 캐시 제거 */
  sweep(liveGroupIds: ReadonlySet<string>): void
}

export function createOuterEdgesCache(
  compute: (parcels: readonly { poly: Point[] }[]) => Edge[] = computeOuterEdges,
): OuterEdgesCache {
  const cache = new Map<string, { memberKey: string; edges: Edge[] }>()
  return {
    get(groupId, members) {
      const memberKey = members.map((m) => m.id).join('|')
      const hit = cache.get(groupId)
      if (hit && hit.memberKey === memberKey) return hit.edges
      const edges = compute(members)
      cache.set(groupId, { memberKey, edges })
      return edges
    },
    sweep(liveGroupIds) {
      for (const groupId of [...cache.keys()]) {
        if (!liveGroupIds.has(groupId)) cache.delete(groupId)
      }
    },
  }
}
