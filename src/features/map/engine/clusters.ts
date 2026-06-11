import type { Point } from '../../../utils/geo'

export interface ClusterSource {
  id: string
  poly: Point[]
}

/**
 * 인접 필지 클러스터 탐색 (v1 MapView.jsx findClusters 동작 보존).
 * 폴리곤 변을 toFixed(6) 좌표쌍 정규화 키로 인덱싱해 같은 변 키를 공유하는(등장 ≥2)
 * 필지를 인접으로 보고, BFS 연결 요소를 클러스터로 반환한다 (outerEdges와 동일 변 키 규칙).
 */
export function findClusters<T extends { poly: Point[] }>(parcels: readonly T[]): T[][] {
  if (!parcels.length) return []
  const edgeToParcels = new Map<string, number[]>()
  parcels.forEach((p, i) => {
    for (let j = 0; j < p.poly.length; j++) {
      const p1 = p.poly[j]
      const p2 = p.poly[(j + 1) % p.poly.length]
      const a = p1[0].toFixed(6) + ',' + p1[1].toFixed(6)
      const b = p2[0].toFixed(6) + ',' + p2[1].toFixed(6)
      const key = a < b ? a + '|' + b : b + '|' + a
      const list = edgeToParcels.get(key)
      if (list) list.push(i)
      else edgeToParcels.set(key, [i])
    }
  })
  const adj: Set<number>[] = parcels.map(() => new Set<number>())
  edgeToParcels.forEach((indices) => {
    if (indices.length >= 2) {
      for (let a = 0; a < indices.length; a++) {
        for (let b = a + 1; b < indices.length; b++) {
          adj[indices[a]].add(indices[b])
          adj[indices[b]].add(indices[a])
        }
      }
    }
  })
  const visited = new Array<boolean>(parcels.length).fill(false)
  const clusters: T[][] = []
  for (let i = 0; i < parcels.length; i++) {
    if (visited[i]) continue
    const cluster: T[] = []
    const queue = [i]
    while (queue.length) {
      const cur = queue.shift()
      if (cur === undefined || visited[cur]) continue
      visited[cur] = true
      cluster.push(parcels[cur])
      adj[cur].forEach((nb) => {
        if (!visited[nb]) queue.push(nb)
      })
    }
    clusters.push(cluster)
  }
  return clusters
}

/**
 * 그룹별 클러스터 캐시 (성능 개선 ② — v1은 팬/줌마다 전 그룹 BFS 재계산).
 * 클러스터 구성은 데이터 좌표만으로 결정되며 viewport와 무관 — 멤버 구성
 * (parcelIds 순서 포함)이 같으면 재계산하지 않는다 (outerEdgesCache와 동일 키 전략).
 */
export interface ClustersCache {
  get(groupId: string, members: readonly ClusterSource[]): ClusterSource[][]
  /** 사라진 그룹의 캐시 제거 */
  sweep(liveGroupIds: ReadonlySet<string>): void
}

export function createClustersCache(
  compute: (parcels: readonly ClusterSource[]) => ClusterSource[][] = findClusters,
): ClustersCache {
  const cache = new Map<string, { memberKey: string; clusters: ClusterSource[][] }>()
  return {
    get(groupId, members) {
      const memberKey = members.map((m) => m.id).join('|')
      const hit = cache.get(groupId)
      if (hit && hit.memberKey === memberKey) return hit.clusters
      const clusters = compute(members)
      cache.set(groupId, { memberKey, clusters })
      return clusters
    },
    sweep(liveGroupIds) {
      for (const groupId of [...cache.keys()]) {
        if (!liveGroupIds.has(groupId)) cache.delete(groupId)
      }
    },
  }
}
