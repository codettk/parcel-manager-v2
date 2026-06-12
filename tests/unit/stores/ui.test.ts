import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../src/lib/api'
import { AREA_UNIT_STORAGE_KEY, useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { Group } from '../../../src/types/api/tabState'

// 명세: docs/specs/parcel-sheet.md §영향 범위 — tapParcel 원자 설정/해제, closeSheet, areaUnit 영속
// + docs/specs/parcel-list.md §행 탭 (B-1 정정) — openParcelFromList 모드 분기 비경유, openListView 모드 해제
vi.mock('../../../src/lib/api', () => ({
  api: { tabState: { upsertGroup: vi.fn() } },
}))

const GROUP_G: Group = {
  name: 'G',
  memo: null,
  color: 'sun',
  style: 'fill',
  parcelIds: ['p2', 'p3'],
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
  vi.clearAllMocks()
  vi.mocked(api.tabState.upsertGroup).mockResolvedValue({ ok: true })
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

describe('openParcelFromList — 목록 행 탭은 시트 분기 직행, 모드 분기 비경유 (B-1)', () => {
  it('멀티선택 모드 활성 중에도 그룹 시트가 직행으로 열리고 선택 집합은 불변이다', () => {
    useWorkspaceStore.setState({ activeTabId: 'tab_a', groups: { g1: GROUP_G } })
    useUiStore.getState().setInitializing(false)
    useUiStore.getState().toggleMultiSelectMode()

    useUiStore.getState().openParcelFromList('p2')

    const ui = useUiStore.getState()
    expect(ui.openSheet).toBe('group')
    expect(ui.selectedGroupId).toBe('g1')
    expect(ui.selectedParcelId).toBeNull()
    expect(ui.multiSelectedIds).toEqual([]) // 멤버 토글이 일어나지 않는다
    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
  })

  it('추가모드 활성 중에도 필지 시트가 직행으로 열리고 그룹 멤버십·서버 호출이 없다', () => {
    useWorkspaceStore.setState({ activeTabId: 'tab_a', groups: { g1: GROUP_G } })
    useUiStore.getState().setInitializing(false)
    useUiStore.getState().enterAddToGroupMode('g1')

    useUiStore.getState().openParcelFromList('p1')

    const ui = useUiStore.getState()
    expect(ui.openSheet).toBe('parcel')
    expect(ui.selectedParcelId).toBe('p1')
    expect(useWorkspaceStore.getState().groups['g1']?.parcelIds).toEqual(['p2', 'p3'])
    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
  })

  it('pending 드래프트 중 다른 대상 탭 = 드래프트 원복 후 새 대상 (tapParcel 동일 의미론)', () => {
    useWorkspaceStore.setState({ activeTabId: 'tab_a', groups: { g1: GROUP_G } })
    useUiStore.getState().setInitializing(false)
    useWorkspaceStore.getState().beginGroupDraft(['p1', 'p2'])
    const newId = useWorkspaceStore.getState().pendingGroupCreate?.groupId ?? ''

    useUiStore.getState().openParcelFromList('p3')

    const ws = useWorkspaceStore.getState()
    expect(ws.pendingGroupCreate).toBeNull()
    expect(ws.groups).not.toHaveProperty(newId)
    expect(ws.groups['g1']).toEqual(GROUP_G) // 원복 후 p3는 g1 소속으로 재산출
    expect(useUiStore.getState().openSheet).toBe('group')
    expect(useUiStore.getState().selectedGroupId).toBe('g1')
    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
  })

  it('isInitializing 중에는 무시된다 (C-4)', () => {
    useUiStore.getState().openParcelFromList('p1')

    expect(useUiStore.getState().openSheet).toBeNull()
    expect(useUiStore.getState().selectedParcelId).toBeNull()
  })
})

describe('openListView — 진입 시 활성 모드 해제 (B-1)', () => {
  it('멀티선택 모드와 선택 집합을 함께 해제한다', () => {
    useUiStore.getState().setInitializing(false)
    useUiStore.getState().toggleMultiSelectMode()
    useUiStore.getState().tapParcel('p1')

    useUiStore.getState().openListView()

    const ui = useUiStore.getState()
    expect(ui.listViewOpen).toBe(true)
    expect(ui.multiSelectMode).toBe(false)
    expect(ui.multiSelectedIds).toEqual([])
  })

  it('추가모드는 시트 미복귀 단순 해제다 (finishAddToGroupMode와 달리 그룹 시트를 열지 않음)', () => {
    useWorkspaceStore.setState({ activeTabId: 'tab_a', groups: { g1: GROUP_G } })
    useUiStore.getState().setInitializing(false)
    useUiStore.getState().enterAddToGroupMode('g1')

    useUiStore.getState().openListView()

    const ui = useUiStore.getState()
    expect(ui.listViewOpen).toBe(true)
    expect(ui.addToGroupModeGroupId).toBeNull()
    expect(ui.openSheet).toBeNull() // 복귀 시트는 목록 아래 깔리므로 열지 않는다
    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
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
