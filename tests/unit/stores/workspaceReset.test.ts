import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { api } from '../../../src/lib/api'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import { useUiStore } from '../../../src/stores/ui'
import type { Group, ParcelOverride } from '../../../src/types/api/tabState'

// 명세: docs/specs/reset.md — AC-9·AC-10 (워크스페이스 reset 액션).
vi.mock('../../../src/lib/api', () => ({
  api: { tabState: { reset: vi.fn() } },
}))

function makeOverride(patch: Partial<ParcelOverride>): ParcelOverride {
  return { color: null, style: null, name: null, memo: null, pinned: false, icon: null, ...patch }
}

function makeGroup(patch: Partial<Group>): Group {
  return { name: null, memo: null, color: null, style: 'fill', parcelIds: [], ...patch }
}

let consoleErrorSpy: MockInstance

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  vi.clearAllMocks()
  vi.mocked(api.tabState.reset).mockResolvedValue({ ok: true })
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  useWorkspaceStore.setState({ activeTabId: 'tab_a' })
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('AC-9: reset(["color"]) — pinned 보호 + color/style 제거 + api 1회', () => {
  it('비고정 필지 color/style은 비우고(빈 행 삭제), pinned 필지 color는 보존하며 reset 1회 호출', () => {
    useWorkspaceStore.setState({
      overrides: {
        p1: makeOverride({ color: 'eco', style: 'fill' }), // 비고정 → color만이라 행 삭제
        p2: makeOverride({ color: 'sun', style: 'border', name: '북단' }), // 비고정 → name 남아 보존
        p3: makeOverride({ color: 'sky', style: 'fill', pinned: true }), // 고정 → 보호
      },
    })

    useWorkspaceStore.getState().reset(['color'])

    const { overrides } = useWorkspaceStore.getState()
    expect(overrides.p1).toBeUndefined()
    expect(overrides.p2).toEqual(makeOverride({ color: null, style: null, name: '북단' }))
    expect(overrides.p3).toEqual(makeOverride({ color: 'sky', style: 'fill', pinned: true }))

    expect(api.tabState.reset).toHaveBeenCalledExactlyOnceWith('tab_a', { items: ['color'] })
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})

describe('AC-10: reset(["group"]) — groups 비움, 모든 override 보존', () => {
  it('groups가 {}로 비워지고 pinned 포함 overrides는 그대로 유지된다', () => {
    const p1 = makeOverride({ color: 'eco', style: 'fill' })
    const p2 = makeOverride({ color: 'sky', style: 'fill', pinned: true })
    useWorkspaceStore.setState({
      overrides: { p1, p2 },
      groups: { g1: makeGroup({ name: 'A', parcelIds: ['p1'] }) },
    })

    useWorkspaceStore.getState().reset(['group'])

    const { overrides, groups } = useWorkspaceStore.getState()
    expect(groups).toEqual({})
    expect(overrides).toEqual({ p1, p2 })
    expect(api.tabState.reset).toHaveBeenCalledExactlyOnceWith('tab_a', { items: ['group'] })
  })
})

describe('가드: activeTabId null·빈 items', () => {
  it('activeTabId가 null이면 reset은 무시(api 미호출)', () => {
    useWorkspaceStore.setState({ activeTabId: null })
    useWorkspaceStore.getState().reset(['color'])
    expect(api.tabState.reset).not.toHaveBeenCalled()
  })

  it('빈 items는 무시(api 미호출)', () => {
    useWorkspaceStore.getState().reset([])
    expect(api.tabState.reset).not.toHaveBeenCalled()
  })
})
