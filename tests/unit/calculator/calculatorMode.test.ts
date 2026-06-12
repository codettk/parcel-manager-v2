import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../src/lib/api'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { Group } from '../../../src/types/api/tabState'

// 명세: docs/specs/calculator.md §계산기 모드 — ui 스토어 분기 (AC-11/12 E2E의 스토어 계층 보강)
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

describe('enterCalculatorMode — 모드 충돌 차단', () => {
  it('멀티선택·열린 시트·선택을 해제하고 모드를 켠다', () => {
    useUiStore.getState().setInitializing(false)
    useUiStore.getState().toggleMultiSelectMode()
    useUiStore.setState({ multiSelectedIds: ['p1'] })

    useUiStore.getState().enterCalculatorMode()

    const ui = useUiStore.getState()
    expect(ui.calculatorActive).toBe(true)
    expect(ui.multiSelectMode).toBe(false)
    expect(ui.multiSelectedIds).toEqual([])
    expect(ui.addToGroupModeGroupId).toBeNull()
    expect(ui.openSheet).toBeNull()
    expect(ui.selectedParcelId).toBeNull()
  })

  it('pending 그룹 드래프트는 원복된다 (서버 호출 0회)', () => {
    useWorkspaceStore.setState({ activeTabId: 'tab_a', groups: { g1: GROUP_G } })
    useUiStore.getState().setInitializing(false)
    useWorkspaceStore.getState().beginGroupDraft(['p1', 'p2'])
    const draftId = useWorkspaceStore.getState().pendingGroupCreate?.groupId ?? ''

    useUiStore.getState().enterCalculatorMode()

    const ws = useWorkspaceStore.getState()
    expect(ws.pendingGroupCreate).toBeNull()
    expect(ws.groups).not.toHaveProperty(draftId)
    expect(ws.groups['g1']).toEqual(GROUP_G)
    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
  })
})

describe('tapParcel — 계산기 모드 분기 (v1 app.jsx:244 가드 보존)', () => {
  it('그룹 소속 필지도 그룹 분기를 우회하고 결과 시트로 직행한다', () => {
    useWorkspaceStore.setState({ activeTabId: 'tab_a', groups: { g1: GROUP_G } })
    useUiStore.getState().setInitializing(false)
    useUiStore.getState().enterCalculatorMode()

    useUiStore.getState().tapParcel('p2')

    const ui = useUiStore.getState()
    expect(ui.openSheet).toBe('calcResult')
    expect(ui.selectedParcelId).toBe('p2')
    expect(ui.selectedGroupId).toBeNull() // 그룹 강조는 결과 시트의 그룹 모드 소관
  })

  it('빈 곳 탭은 결과 시트만 닫고 모드는 유지한다', () => {
    useUiStore.getState().setInitializing(false)
    useUiStore.getState().enterCalculatorMode()
    useUiStore.getState().tapParcel('p1')

    useUiStore.getState().tapParcel(null)

    const ui = useUiStore.getState()
    expect(ui.openSheet).toBeNull()
    expect(ui.selectedParcelId).toBeNull()
    expect(ui.calculatorActive).toBe(true)
  })
})

describe('exitCalculatorMode — 종료', () => {
  it('모드·선택·결과 시트를 함께 해제한다', () => {
    useUiStore.getState().setInitializing(false)
    useUiStore.getState().enterCalculatorMode()
    useUiStore.getState().tapParcel('p1')

    useUiStore.getState().exitCalculatorMode()

    const ui = useUiStore.getState()
    expect(ui.calculatorActive).toBe(false)
    expect(ui.openSheet).toBeNull()
    expect(ui.selectedParcelId).toBeNull()
    expect(ui.selectedGroupId).toBeNull()
  })
})

describe('openParcelFromList — 계산기 모드 중에는 모드 우선 (구현 결정)', () => {
  it('그룹 소속 행 탭도 일반 그룹 시트 대신 결과 시트로 직행한다', () => {
    useWorkspaceStore.setState({ activeTabId: 'tab_a', groups: { g1: GROUP_G } })
    useUiStore.getState().setInitializing(false)
    useUiStore.getState().enterCalculatorMode()

    useUiStore.getState().openParcelFromList('p2')

    const ui = useUiStore.getState()
    expect(ui.openSheet).toBe('calcResult')
    expect(ui.selectedParcelId).toBe('p2')
    expect(ui.selectedGroupId).toBeNull()
    expect(ui.calculatorActive).toBe(true)
  })
})
