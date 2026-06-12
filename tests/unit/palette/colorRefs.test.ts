import { describe, expect, it } from 'vitest'
import { buildDeleteWarning, countColorRefs } from '../../../src/features/palette/colorRefs'
import type { Group, ParcelOverride } from '../../../src/types/api/tabState'

function makeOverride(color: string | null): ParcelOverride {
  return { color, style: color ? 'fill' : null, name: null, memo: null, pinned: false, icon: null }
}

function makeGroup(color: string | null): Group {
  return { name: null, memo: null, color, style: 'fill', parcelIds: [] }
}

describe('countColorRefs — 현재 탭 참조 수 집계', () => {
  it('overrides·groups에서 해당 colorId만 센다', () => {
    const overrides = { p1: makeOverride('c'), p2: makeOverride('c'), p3: makeOverride('other') }
    const groups = { g1: makeGroup('c'), g2: makeGroup(null) }

    expect(countColorRefs(overrides, groups, 'c')).toEqual({ parcels: 2, groups: 1 })
    expect(countColorRefs(overrides, groups, 'unused')).toEqual({ parcels: 0, groups: 0 })
  })
})

describe('buildDeleteWarning — 경고 문구', () => {
  it('필지·그룹 참조 조합별 문구를 만들고 참조 0이면 null', () => {
    expect(buildDeleteWarning({ parcels: 2, groups: 0 })).toBe(
      '필지 2개가 색상 없음으로 변경됩니다 (모든 탭 적용)',
    )
    expect(buildDeleteWarning({ parcels: 2, groups: 1 })).toBe(
      '필지 2개·그룹 1개가 색상 없음으로 변경됩니다 (모든 탭 적용)',
    )
    expect(buildDeleteWarning({ parcels: 0, groups: 3 })).toBe(
      '그룹 3개가 색상 없음으로 변경됩니다 (모든 탭 적용)',
    )
    expect(buildDeleteWarning({ parcels: 0, groups: 0 })).toBeNull()
  })
})
