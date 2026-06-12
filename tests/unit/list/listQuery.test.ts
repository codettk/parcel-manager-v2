import { describe, expect, it } from 'vitest'
import {
  applyColorFilter,
  applySearch,
  buildRows,
  duplicateSuffix,
  findDuplicateJibuns,
  sortRows,
  type ListRowData,
} from '../../../src/features/list/listQuery'
import type { ColorLabel } from '../../../src/types/api/colors'
import type { Group, ParcelOverride } from '../../../src/types/api/tabState'

// 명세: docs/specs/parcel-list.md — AC-1~AC-5 (listQuery 순수 함수)

function override(patch: Partial<ParcelOverride>): ParcelOverride {
  return { color: null, style: null, name: null, memo: null, pinned: false, icon: null, ...patch }
}

function group(patch: Partial<Group>): Group {
  return { name: null, memo: null, color: null, style: 'fill', parcelIds: [], ...patch }
}

function row(patch: Partial<ListRowData> & Pick<ListRowData, 'id' | 'jibun'>): ListRowData {
  return { displayName: patch.jibun, colorId: null, groupName: null, area: null, ...patch }
}

const PALETTE: ColorLabel[] = [
  { colorId: 'c1', label: '벼', hex: '#6CA945', sortOrder: 0 },
  { colorId: 'c2', label: '콩', hex: '#E5A300', sortOrder: 1 },
]

describe('AC-1: 행 데이터 도출 (그룹 색·그룹명 / override 색 / displayName 우선순위)', () => {
  const parcels = [
    { id: 'p1', jibun: '435-1' },
    { id: 'p2', jibun: '435-2' },
    { id: 'p3', jibun: '산 86' },
  ]
  const overrides: Record<string, ParcelOverride> = {
    // p1은 개별 색도 갖지만 그룹 소속이면 그룹 색이 이긴다 (v1 보존)
    p1: override({ color: 'c2' }),
    p2: override({ color: 'c1' }),
    p3: override({ name: '양촌 가물치골' }),
  }
  const groups: Record<string, Group> = {
    g1: group({ name: '방제반', color: 'c1', parcelIds: ['p1'] }),
  }
  const parcelToGroup = { p1: 'g1' }
  const areas = { p1: 1000, p2: null }

  it('그룹 소속 행은 그룹 색·그룹명, 비소속 행은 override 색을 가진다', () => {
    const rows = buildRows(parcels, overrides, groups, parcelToGroup, areas)
    expect(rows[0]).toEqual({
      id: 'p1',
      jibun: '435-1',
      displayName: '435-1',
      colorId: 'c1',
      groupName: '방제반',
      area: 1000,
    })
    expect(rows[1]).toEqual({
      id: 'p2',
      jibun: '435-2',
      displayName: '435-2',
      colorId: 'c1',
      groupName: null,
      area: null,
    })
  })

  it('displayName은 override.name 우선, 없으면 jibun', () => {
    const rows = buildRows(parcels, overrides, groups, parcelToGroup, areas)
    expect(rows[2].displayName).toBe('양촌 가물치골')
    expect(rows[2].jibun).toBe('산 86')
    expect(rows[0].displayName).toBe('435-1')
  })
})

describe('AC-2: 중복지번 Set + 커스텀명 없는 행 한정 병기', () => {
  const rows = [
    row({ id: 'a1001', jibun: '산 86-1' }),
    row({ id: 'b2042', jibun: '산 86-1', displayName: '뒷산 밭' }),
    row({ id: 'c3003', jibun: '산 86-1' }),
    row({ id: 'd4004', jibun: '437' }),
  ]

  it('2개 이상 출현하는 jibun만 Set에 포함된다', () => {
    const dup = findDuplicateJibuns(rows)
    expect(dup).toEqual(new Set(['산 86-1']))
  })

  it('커스텀명 없는 중복 행만 #<id 끝 4자리> 병기 대상이다', () => {
    const dup = findDuplicateJibuns(rows)
    expect(duplicateSuffix(rows[0], dup)).toBe('#1001')
    expect(duplicateSuffix(rows[1], dup)).toBeNull() // 커스텀명 있는 행은 비대상
    expect(duplicateSuffix(rows[2], dup)).toBe('#3003')
    expect(duplicateSuffix(rows[3], dup)).toBeNull() // 중복 아님
  })
})

describe('AC-3: 검색 — trim + lowercase, displayName·jibun·groupName 3개 필드', () => {
  const rows = [
    row({ id: 'p1', jibun: '435-1', displayName: '집앞 논' }),
    row({ id: 'p2', jibun: '435-2', groupName: '논농사 모임' }),
    row({ id: 'p3', jibun: '산 86', groupName: null }),
    row({ id: 'p4', jibun: 'AB-1' }),
  ]

  it('" 논 " (공백 포함) → displayName·groupName 매칭 행만 남는다 (groupName null 안전)', () => {
    const result = applySearch(rows, ' 논 ')
    expect(result.map((r) => r.id)).toEqual(['p1', 'p2'])
  })

  it('jibun 매칭 + 대소문자 무시', () => {
    expect(applySearch(rows, 'ab').map((r) => r.id)).toEqual(['p4'])
    expect(applySearch(rows, '산 86').map((r) => r.id)).toEqual(['p3'])
  })

  it('빈 검색어(공백만)는 전 행 유지', () => {
    expect(applySearch(rows, '   ')).toEqual(rows)
  })
})

describe('AC-4: 색 필터 — 다중 OR + none(미지정) + 빈 배열 = 전체', () => {
  const rows = [
    row({ id: 'p1', jibun: '1', colorId: 'c1' }),
    row({ id: 'p2', jibun: '2', colorId: 'c2' }),
    row({ id: 'p3', jibun: '3', colorId: null }),
  ]

  it("['c1','none'] → c1 행과 색 없는 행만 남는다", () => {
    expect(applyColorFilter(rows, ['c1', 'none']).map((r) => r.id)).toEqual(['p1', 'p3'])
  })

  it('빈 배열이면 전 행이 남는다', () => {
    expect(applyColorFilter(rows, [])).toEqual(rows)
  })
})

describe('AC-5: 정렬 3종', () => {
  it("지번순 — localeCompare('ko') 순서", () => {
    const rows = [
      row({ id: 'p1', jibun: '다-1' }),
      row({ id: 'p2', jibun: '가-1' }),
      row({ id: 'p3', jibun: '나-1' }),
    ]
    expect(sortRows(rows, 'jibun', PALETTE).map((r) => r.jibun)).toEqual(['가-1', '나-1', '다-1'])
  })

  it('색상순 — 팔레트 순서 → 삭제된 색 → 미지정, 동순위 지번순', () => {
    const rows = [
      row({ id: 'p1', jibun: '나', colorId: null }),
      row({ id: 'p2', jibun: '가', colorId: 'c-deleted' }),
      row({ id: 'p3', jibun: '다', colorId: 'c2' }),
      row({ id: 'p4', jibun: '나', colorId: 'c1' }),
      row({ id: 'p5', jibun: '가', colorId: 'c1' }),
    ]
    expect(sortRows(rows, 'color', PALETTE).map((r) => r.id)).toEqual([
      'p5', // c1 — 동순위 지번순 (가 < 나)
      'p4', // c1
      'p3', // c2
      'p2', // 삭제된 색 — 팔레트 뒤
      'p1', // 미지정 맨 뒤
    ])
  })

  it('면적순 — lndpclAr 내림차순, null 맨 뒤 (동순위·null끼리 지번순)', () => {
    const rows = [
      row({ id: 'p1', jibun: '나', area: null }),
      row({ id: 'p2', jibun: '가', area: 100 }),
      row({ id: 'p3', jibun: '다', area: 300 }),
      row({ id: 'p4', jibun: '가', area: null }),
      row({ id: 'p5', jibun: '라', area: 300 }),
    ]
    expect(sortRows(rows, 'area', PALETTE).map((r) => r.id)).toEqual([
      'p3', // 300 — 동순위 지번순 (다 < 라)
      'p5', // 300
      'p2', // 100
      'p4', // null — 지번순 (가 < 나)
      'p1',
    ])
  })

  it('원본 배열을 변형하지 않는다', () => {
    const rows = [row({ id: 'p1', jibun: '나' }), row({ id: 'p2', jibun: '가' })]
    const snapshot = [...rows]
    sortRows(rows, 'jibun', PALETTE)
    expect(rows).toEqual(snapshot)
  })
})
