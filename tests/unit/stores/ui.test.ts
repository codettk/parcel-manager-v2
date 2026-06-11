import { beforeEach, describe, expect, it } from 'vitest'
import { AREA_UNIT_STORAGE_KEY, useUiStore } from '../../../src/stores/ui'

// 명세: docs/specs/parcel-sheet.md §영향 범위 — tapParcel 원자 설정/해제, closeSheet, areaUnit 영속
beforeEach(() => {
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
})

describe('tapParcel — 선택과 시트 열림의 원자 설정/해제', () => {
  it('필지 탭 시 selectedParcelId와 openSheet가 함께 설정된다', () => {
    useUiStore.getState().setInitializing(false)
    useUiStore.getState().tapParcel('p1')

    expect(useUiStore.getState().selectedParcelId).toBe('p1')
    expect(useUiStore.getState().openSheet).toBe('parcel')
  })

  it('빈 곳 탭(null) 시 선택과 시트가 함께 해제된다', () => {
    useUiStore.getState().setInitializing(false)
    useUiStore.getState().tapParcel('p1')
    useUiStore.getState().tapParcel(null)

    expect(useUiStore.getState().selectedParcelId).toBeNull()
    expect(useUiStore.getState().openSheet).toBeNull()
  })

  it('isInitializing 중에는 무시된다 (C-4)', () => {
    useUiStore.getState().tapParcel('p1')

    expect(useUiStore.getState().selectedParcelId).toBeNull()
    expect(useUiStore.getState().openSheet).toBeNull()
  })
})

describe('closeSheet — 시트 닫기 + 선택 해제 (v1 보존)', () => {
  it('openSheet와 selectedParcelId를 함께 해제한다', () => {
    useUiStore.getState().setInitializing(false)
    useUiStore.getState().tapParcel('p1')
    useUiStore.getState().closeSheet()

    expect(useUiStore.getState().openSheet).toBeNull()
    expect(useUiStore.getState().selectedParcelId).toBeNull()
  })
})

describe('areaUnit — 즉시 전역 반영 + localStorage 영속', () => {
  it('기본값은 ㎡이고 setAreaUnit이 localStorage에 기록한다', () => {
    expect(useUiStore.getState().areaUnit).toBe('m2')

    useUiStore.getState().setAreaUnit('pyeong')

    expect(useUiStore.getState().areaUnit).toBe('pyeong')
    expect(localStorage.getItem(AREA_UNIT_STORAGE_KEY)).toBe('pyeong')
  })
})
