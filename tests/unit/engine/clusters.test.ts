// findClusters — 변 toFixed(6) 키 공유 인접 → BFS 연결 요소 (v1 보존)
import { describe, expect, it } from 'vitest'
import { createClustersCache, findClusters } from '../../../src/features/map/engine'
import { square } from './fixtures'

describe('findClusters', () => {
  it('변을 공유하는 인접 필지는 한 클러스터', () => {
    const clusters = findClusters([square('a', 0, 0, 0.2), square('b', 0.2, 0, 0.2)])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].map((p) => p.id).sort()).toEqual(['a', 'b'])
  })

  it('떨어진 필지는 별도 클러스터', () => {
    const clusters = findClusters([
      square('a', 0, 0, 0.2),
      square('b', 0.2, 0, 0.2),
      square('c', 0.6, 0.6, 0.2),
    ])
    expect(clusters).toHaveLength(2)
    expect(clusters.map((c) => c.map((p) => p.id).sort())).toEqual([['a', 'b'], ['c']])
  })

  it('꼭짓점만 닿는 필지는 인접이 아니다 (변 공유 기준)', () => {
    // (0.2,0.2) 한 점만 공유
    expect(findClusters([square('a', 0, 0, 0.2), square('b', 0.2, 0.2, 0.2)])).toHaveLength(2)
  })

  it('빈 입력 → []', () => {
    expect(findClusters([])).toEqual([])
  })
})

describe('createClustersCache', () => {
  it('멤버 구성이 같으면 재사용, 바뀌면 재계산, sweep으로 제거', () => {
    let calls = 0
    const cache = createClustersCache((members) => {
      calls++
      return findClusters(members)
    })
    const members = [square('a', 0, 0, 0.2), square('b', 0.2, 0, 0.2)]
    const first = cache.get('g1', members)
    expect(cache.get('g1', members)).toBe(first)
    expect(calls).toBe(1)

    cache.get('g1', [...members, square('c', 0.6, 0.6, 0.2)])
    expect(calls).toBe(2)

    cache.sweep(new Set<string>())
    cache.get('g1', members)
    expect(calls).toBe(3)
  })
})
