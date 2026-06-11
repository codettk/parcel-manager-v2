import { describe, expect, it } from 'vitest'
import { EMPTY_SELECTION, type SelectionState } from '../../../src/features/map/engine'
import {
  selectColorById,
  selectParcelToGroup,
  selectSelection,
} from '../../../src/stores/selectors'
import type { ColorLabel } from '../../../src/types/api/colors'
import type { Group } from '../../../src/types/api/tabState'

function makeGroup(parcelIds: string[]): Group {
  return { name: null, memo: null, color: null, style: 'fill', parcelIds }
}

describe('selectParcelToGroup (AC-4)', () => {
  it('소속 필지는 자기 groupId로 역산되고 비소속 필지는 키가 없다', () => {
    const groups: Record<string, Group> = {
      g1: makeGroup(['p1', 'p2']),
      g2: makeGroup(['p3']),
    }
    const result = selectParcelToGroup({ groups })

    expect(result).toEqual({ p1: 'g1', p2: 'g1', p3: 'g2' })
    expect(result).not.toHaveProperty('p4')
  })

  it('같은 groups 참조로 재호출하면 동일 객체 참조를 반환한다 (메모이즈)', () => {
    const groups: Record<string, Group> = { g1: makeGroup(['p1']) }
    const first = selectParcelToGroup({ groups })
    const second = selectParcelToGroup({ groups })
    expect(second).toBe(first)

    const changed = selectParcelToGroup({ groups: { g1: makeGroup(['p1']) } })
    expect(changed).not.toBe(first)
    expect(changed).toEqual(first)
  })
})

describe('selectColorById', () => {
  it('colorLabels를 colorId→hex 맵으로 변환하고 같은 참조 입력에 메모이즈된다', () => {
    const colorLabels: ColorLabel[] = [
      { colorId: 'eco', label: '생태', hex: '#2F6B4F', sortOrder: 0 },
      { colorId: 'sun', label: '양지', hex: '#E8A13A', sortOrder: 1 },
    ]
    const first = selectColorById({ colorLabels })
    expect(first).toEqual({ eco: '#2F6B4F', sun: '#E8A13A' })
    expect(selectColorById({ colorLabels })).toBe(first)
  })
})

describe('selectSelection', () => {
  it('선택 5종을 엔진 SelectionState 형태로 추출하고 값이 같으면 참조를 보존한다', () => {
    const state: SelectionState & { isInitializing: boolean } = {
      ...EMPTY_SELECTION,
      selectedParcelId: 'p1',
      isInitializing: false,
    }
    const first = selectSelection(state)
    expect(first).toEqual({ ...EMPTY_SELECTION, selectedParcelId: 'p1' })

    // 무관 필드만 다른 새 상태 객체 — 값 동일이면 참조 보존
    const unrelatedChange: typeof state = { ...state, isInitializing: true }
    expect(selectSelection(unrelatedChange)).toBe(first)

    const changed = selectSelection({ ...state, selectedParcelId: 'p2' })
    expect(changed).not.toBe(first)
    expect(changed.selectedParcelId).toBe('p2')
  })
})
