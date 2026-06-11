import { describe, expect, it } from 'vitest'
import type { Point } from '../../../src/utils/geo'
import {
  computeOuterEdges,
  createOuterEdgesCache,
  renderScene,
  type Edge,
  type MapScene,
} from '../../../src/features/map/engine'
import { createMockCtx } from './mockContext'
import { SIZE, makeGroup, makeScene, parcelToGroupOf, square } from './fixtures'

function rect(ox: number, oy: number): { poly: Point[] } {
  return {
    poly: [
      [ox, oy],
      [ox + 1, oy],
      [ox + 1, oy + 1],
      [ox, oy + 1],
    ],
  }
}

describe('computeOuterEdges — AC-3', () => {
  it('한 변을 공유하는 인접 사각형 2개 → 공유 변 제외 6개', () => {
    const edges = computeOuterEdges([rect(0, 0), rect(1, 0)])
    expect(edges).toHaveLength(6)
    // 공유 변 (1,0)-(1,1)은 포함되지 않는다
    const hasShared = edges.some(([p1, p2]) => p1[0] === 1 && p2[0] === 1 && p1[1] !== p2[1])
    expect(hasShared).toBe(false)
  })

  it('비인접 사각형 2개 → 모든 변 8개', () => {
    expect(computeOuterEdges([rect(0, 0), rect(3, 0)])).toHaveLength(8)
  })

  it('단일 폴리곤 → 자기 변 전부', () => {
    expect(computeOuterEdges([rect(0, 0)])).toHaveLength(4)
  })
})

describe('createOuterEdgesCache', () => {
  it('멤버 구성이 같으면 같은 결과를 재사용한다 (참조 동일)', () => {
    const cache = createOuterEdgesCache()
    const members = [square('a', 0, 0), square('b', 0.1, 0)]
    const first = cache.get('g1', members)
    const second = cache.get('g1', members)
    expect(second).toBe(first)
  })

  it('멤버 구성이 바뀌면 재계산한다', () => {
    let calls = 0
    const cache = createOuterEdgesCache((parcels) => {
      calls++
      return computeOuterEdges(parcels)
    })
    cache.get('g1', [square('a', 0, 0)])
    cache.get('g1', [square('a', 0, 0), square('b', 0.1, 0)])
    expect(calls).toBe(2)
  })

  it('sweep은 사라진 그룹의 캐시를 비운다', () => {
    let calls = 0
    const cache = createOuterEdgesCache((parcels) => {
      calls++
      return computeOuterEdges(parcels)
    })
    const members = [square('a', 0, 0)]
    cache.get('g1', members)
    cache.sweep(new Set<string>())
    cache.get('g1', members)
    expect(calls).toBe(2)
  })
})

describe('renderScene + memo — AC-4', () => {
  function sceneWith(groups: MapScene['groups']): MapScene {
    return makeScene({
      parcels: [
        square('a', 0, 0),
        square('b', 0.1, 0),
        square('c', 0.4, 0),
        square('d', 0.5, 0),
        square('e', 0.2, 0),
      ],
      groups,
      parcelToGroup: parcelToGroupOf(groups),
      colorById: { green: '#00FF00' },
    })
  }

  it('동일 groups로 2회 렌더 시 그룹당 1회만 계산하고, parcelIds 변경 시 그 그룹만 재계산한다', () => {
    const computedSizes: number[] = []
    const cache = createOuterEdgesCache((parcels) => {
      computedSizes.push(parcels.length)
      return computeOuterEdges(parcels)
    })
    const scene = sceneWith({
      g1: makeGroup({ parcelIds: ['a', 'b'] }),
      g2: makeGroup({ color: 'green', parcelIds: ['c', 'd'] }),
    })

    renderScene(createMockCtx().ctx, scene, SIZE, cache)
    renderScene(createMockCtx().ctx, scene, SIZE, cache)
    // 2회 렌더에도 실제 계산은 그룹당 1회 (팬/줌 동등 시나리오 — transform만 바뀌면 캐시 히트)
    expect(computedSizes).toEqual([2, 2])

    // g1의 멤버 구성 변경 → g1만 재계산 (멤버 3개), g2는 캐시 히트
    const changed = sceneWith({
      g1: makeGroup({ parcelIds: ['a', 'b', 'e'] }),
      g2: makeGroup({ color: 'green', parcelIds: ['c', 'd'] }),
    })
    renderScene(createMockCtx().ctx, changed, SIZE, cache)
    expect(computedSizes).toEqual([2, 2, 3])
  })

  it('5차 선택 그룹 렌더도 동일 캐시를 사용한다 (추가 계산 없음)', () => {
    let calls = 0
    const cache = createOuterEdgesCache((parcels) => {
      calls++
      return computeOuterEdges(parcels)
    })
    const groups = { g1: makeGroup({ parcelIds: ['a', 'b'] }) }
    const scene = makeScene({
      parcels: [square('a', 0, 0), square('b', 0.1, 0)],
      groups,
      parcelToGroup: parcelToGroupOf(groups),
      selection: {
        selectedParcelId: null,
        selectedGroupId: 'g1',
        multiSelectMode: false,
        multiSelectedIds: [],
        addToGroupModeGroupId: null,
      },
    })
    renderScene(createMockCtx().ctx, scene, SIZE, cache)
    expect(calls).toBe(1)
  })
})

describe('computeOuterEdges 결과의 변 형태', () => {
  it('변은 [시작점, 끝점] 쌍이다', () => {
    const edges: Edge[] = computeOuterEdges([rect(0, 0)])
    for (const [p1, p2] of edges) {
      expect(p1).toHaveLength(2)
      expect(p2).toHaveLength(2)
    }
  })
})
