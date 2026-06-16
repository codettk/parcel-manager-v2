import { describe, expect, it } from 'vitest'
import {
  ALL_JIMOK,
  classifyJimok,
  isAllJimok,
  visibleParcelIds,
  type JimokKey,
} from '../../src/features/map/jimok'

// 명세: docs/specs/jimok-filter.md — AC-1(분류)·AC-2(가시 6/0/부분)·AC-3(끝글자 미상→기타→미선택시 비가시)

describe('classifyJimok — 지번 끝글자 분류 (AC-1)', () => {
  it('끝글자가 답/전/대/도/임이면 그 글자를 반환한다', () => {
    expect(classifyJimok('보구곶리 123답')).toBe('답')
    expect(classifyJimok('보구곶리 7전')).toBe('전')
    expect(classifyJimok('보구곶리 5대')).toBe('대')
    expect(classifyJimok('보구곶리 9도')).toBe('도')
    expect(classifyJimok('보구곶리 2임')).toBe('임')
  })

  it('끝글자가 5종 외이면 기타를 반환한다', () => {
    expect(classifyJimok('보구곶리 7-2공')).toBe('기타')
    expect(classifyJimok('보구곶리 100')).toBe('기타')
    expect(classifyJimok('5번지')).toBe('기타')
  })
})

describe('visibleParcelIds — 가시 집합 산출 (AC-2)', () => {
  const parcels = [
    { id: 'a', jibun: '1답' },
    { id: 'b', jibun: '2전' },
    { id: 'c', jibun: '9공' },
  ]

  it('6종 전체 선택이면 전부 가시', () => {
    const all: JimokKey[] = [...ALL_JIMOK]
    expect([...visibleParcelIds(all, parcels)].sort()).toEqual(['a', 'b', 'c'])
  })

  it('0종 선택이면 가시 0건', () => {
    expect(visibleParcelIds([], parcels).size).toBe(0)
  })

  it("['답']이면 끝글자 답 1건만 가시", () => {
    const visible = visibleParcelIds(['답'], parcels)
    expect([...visible]).toEqual(['a'])
  })
})

describe('visibleParcelIds — 끝글자 미상은 기타 그룹 (AC-3)', () => {
  it("['답','전'] 선택에서 '5번지'(기타)는 비가시", () => {
    const parcels = [
      { id: 'a', jibun: '1답' },
      { id: 'b', jibun: '5번지' },
    ]
    const visible = visibleParcelIds(['답', '전'], parcels)
    expect(visible.has('a')).toBe(true)
    expect(visible.has('b')).toBe(false)
  })

  it("'기타'를 선택하면 끝글자 미상 필지가 가시로 들어온다", () => {
    const parcels = [{ id: 'b', jibun: '5번지' }]
    expect(visibleParcelIds(['기타'], parcels).has('b')).toBe(true)
  })
})

describe('isAllJimok', () => {
  it('6종 전부면 true, 하나라도 빠지면 false', () => {
    expect(isAllJimok([...ALL_JIMOK])).toBe(true)
    expect(isAllJimok(['답', '전', '대', '도', '임'])).toBe(false)
    expect(isAllJimok([])).toBe(false)
  })
})
