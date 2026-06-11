// AC-6: 포개진 지점은 작은(위에 그려진) 필지 우선, 데이터 범위 밖은 null
import { describe, expect, it } from 'vitest'
import { hitTest } from '../../../src/features/map/engine'
import { square } from '../engine/fixtures'

// 면적 내림차순 정렬(큰 → 작은) — 엔진 입력 계약과 동일
const parcels = [
  square('big', 0.1, 0.1, 0.5), // 0.1..0.6
  square('right', 0.7, 0.4, 0.2), // 0.7..0.9 (우측 영역)
  square('small', 0.3, 0.3, 0.1), // big 내부에 포개짐
]

describe('hitTest (AC-6)', () => {
  it('포개진 지점에서는 작은 필지를 반환한다 (역순 순회)', () => {
    expect(hitTest(parcels, [0.35, 0.35])).toBe('small')
  })

  it('큰 필지 단독 영역에서는 큰 필지를 반환한다', () => {
    expect(hitTest(parcels, [0.15, 0.15])).toBe('big')
  })

  it('범위 내 빈 곳은 null', () => {
    expect(hitTest(parcels, [0.65, 0.05])).toBeNull()
  })

  it('데이터 범위 밖은 null', () => {
    expect(hitTest(parcels, [-0.01, 0.5])).toBeNull()
    expect(hitTest(parcels, [1.01, 0.5])).toBeNull()
    expect(hitTest(parcels, [0.5, -0.01])).toBeNull()
    expect(hitTest(parcels, [0.5, 1.01])).toBeNull()
  })

  it('x > aspect(보구곶 ≈0.685)인 우측 영역도 정상 히트 (v1 범위 검사 버그 교정)', () => {
    expect(hitTest(parcels, [0.8, 0.5])).toBe('right')
  })
})
