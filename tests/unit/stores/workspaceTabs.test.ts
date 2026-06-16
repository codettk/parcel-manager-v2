import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { api } from '../../../src/lib/api'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import { useUiStore } from '../../../src/stores/ui'
import type { HistoryItem } from '../../../src/types/api/history'
import type { Tab } from '../../../src/types/api/tabs'

// 명세: docs/specs/tab-workspace.md — 탭 CRUD·히스토리 스토어 액션 (AC-2~8 프론트분)
vi.mock('../../../src/lib/api', () => ({
  api: {
    tabs: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    colors: { list: vi.fn() },
    history: {
      list: vi.fn(),
      rename: vi.fn(),
      restore: vi.fn(),
      remove: vi.fn(),
    },
    tabState: { get: vi.fn() },
  },
}))

function makeTab(tabId: string, name: string, sortOrder: number): Tab {
  return {
    tabId,
    name,
    sortOrder,
    closedAt: null,
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedBy: null,
    updatedAt: '2026-06-16T00:00:00.000Z',
  }
}

function makeHistory(tabId: string, name: string, closedAt: string): HistoryItem {
  return {
    tabId,
    name,
    sortOrder: 0,
    closedAt,
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedBy: null,
    updatedAt: '2026-06-16T00:00:00.000Z',
  }
}

const TAB_A = makeTab('tab_a', '탭 A', 0)
const TAB_B = makeTab('tab_b', '탭 B', 1)

let consoleErrorSpy: MockInstance

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  // tabState.get은 모든 setActiveTab 경로에서 호출됨 — 기본 빈 응답
  vi.mocked(api.tabState.get).mockResolvedValue({ overrides: {}, groups: {} })
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('createTab() — AC-2', () => {
  it('생성 → 목록에 추가 + 새 탭으로 전환 + overrides 비움', async () => {
    useWorkspaceStore.setState({
      tabs: [TAB_A],
      activeTabId: 'tab_a',
      overrides: {
        p1: { color: 'eco', style: 'fill', name: null, memo: null, pinned: false, icon: null },
      },
    })
    const NEW = makeTab('tab_new', '새 작업공간', 1)
    vi.mocked(api.tabs.create).mockResolvedValue(NEW)

    await useWorkspaceStore.getState().createTab()

    const s = useWorkspaceStore.getState()
    expect(api.tabs.create).toHaveBeenCalledExactlyOnceWith()
    expect(s.tabs).toEqual([TAB_A, NEW])
    expect(s.activeTabId).toBe('tab_new')
    expect(s.overrides).toEqual({})
    expect(api.tabState.get).toHaveBeenCalledExactlyOnceWith('tab_new')
  })
})

describe('renameTab() — AC-3', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ tabs: [TAB_A, TAB_B], activeTabId: 'tab_a' })
    vi.mocked(api.tabs.update).mockResolvedValue({ ...TAB_A, name: '내 작업' })
  })

  it('낙관적 라벨 갱신 + update 1회', () => {
    useWorkspaceStore.getState().renameTab('tab_a', '내 작업')

    expect(useWorkspaceStore.getState().tabs[0].name).toBe('내 작업')
    expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith('tab_a', { name: '내 작업' })
  })

  it('빈 이름(공백)은 무시 — update 미호출', () => {
    useWorkspaceStore.getState().renameTab('tab_a', '   ')

    expect(useWorkspaceStore.getState().tabs[0].name).toBe('탭 A')
    expect(api.tabs.update).not.toHaveBeenCalled()
  })
})

describe('softCloseTab() — AC-4', () => {
  it('활성 탭 1개면 no-op — remove 미호출', async () => {
    useWorkspaceStore.setState({ tabs: [TAB_A], activeTabId: 'tab_a' })

    await useWorkspaceStore.getState().softCloseTab('tab_a')

    expect(api.tabs.remove).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().tabs).toEqual([TAB_A])
  })

  it('활성 탭 2개 — 비활성 탭 닫으면 remove 1회 + 목록에서 제거 + 활성 유지', async () => {
    useWorkspaceStore.setState({ tabs: [TAB_A, TAB_B], activeTabId: 'tab_a' })
    vi.mocked(api.tabs.remove).mockResolvedValue({ ok: true })

    await useWorkspaceStore.getState().softCloseTab('tab_b')

    expect(api.tabs.remove).toHaveBeenCalledExactlyOnceWith('tab_b')
    expect(useWorkspaceStore.getState().tabs).toEqual([TAB_A])
    expect(useWorkspaceStore.getState().activeTabId).toBe('tab_a')
    // 비활성 탭을 닫았으므로 전환(tabState.get)이 일어나지 않는다
    expect(api.tabState.get).not.toHaveBeenCalled()
  })

  it('활성 탭을 닫으면 남은 첫 탭으로 setActiveTab', async () => {
    useWorkspaceStore.setState({ tabs: [TAB_A, TAB_B], activeTabId: 'tab_a' })
    vi.mocked(api.tabs.remove).mockResolvedValue({ ok: true })

    await useWorkspaceStore.getState().softCloseTab('tab_a')

    expect(api.tabs.remove).toHaveBeenCalledExactlyOnceWith('tab_a')
    expect(useWorkspaceStore.getState().tabs).toEqual([TAB_B])
    expect(useWorkspaceStore.getState().activeTabId).toBe('tab_b')
    expect(api.tabState.get).toHaveBeenCalledExactlyOnceWith('tab_b')
  })
})

describe('loadHistory()', () => {
  it('GET 결과를 history에 채운다', async () => {
    const items = [
      makeHistory('tab_h1', '히스토리1', '2026-06-15T10:00:00.000Z'),
      makeHistory('tab_h2', '히스토리2', '2026-06-14T10:00:00.000Z'),
    ]
    vi.mocked(api.history.list).mockResolvedValue(items)

    await useWorkspaceStore.getState().loadHistory()

    expect(useWorkspaceStore.getState().history).toEqual(items)
  })
})

describe('restoreHistory() — AC-7', () => {
  it('restore → 새 tabId로 setActiveTab + history에서 제거 + 목록에 추가', async () => {
    const H = makeHistory('tab_h1', '복원 대상', '2026-06-15T10:00:00.000Z')
    useWorkspaceStore.setState({ tabs: [TAB_A], activeTabId: 'tab_a', history: [H] })
    const RESTORED = makeTab('tab_restored', '복원 대상', 1)
    vi.mocked(api.history.restore).mockResolvedValue(RESTORED)

    await useWorkspaceStore.getState().restoreHistory('tab_h1')

    const s = useWorkspaceStore.getState()
    expect(api.history.restore).toHaveBeenCalledExactlyOnceWith('tab_h1')
    expect(s.tabs).toEqual([TAB_A, RESTORED])
    expect(s.activeTabId).toBe('tab_restored')
    expect(s.history).toEqual([]) // 복원된 항목은 히스토리에서 제거
    expect(api.tabState.get).toHaveBeenCalledExactlyOnceWith('tab_restored')
  })
})

describe('renameHistory()', () => {
  it('낙관적 갱신 + rename 1회, 빈 이름 무시', () => {
    const H = makeHistory('tab_h1', '원래', '2026-06-15T10:00:00.000Z')
    useWorkspaceStore.setState({ history: [H] })
    vi.mocked(api.history.rename).mockResolvedValue({ ...H, name: '새 이름' })

    useWorkspaceStore.getState().renameHistory('tab_h1', '새 이름')
    expect(useWorkspaceStore.getState().history[0].name).toBe('새 이름')
    expect(api.history.rename).toHaveBeenCalledExactlyOnceWith('tab_h1', { name: '새 이름' })

    useWorkspaceStore.getState().renameHistory('tab_h1', '  ')
    expect(useWorkspaceStore.getState().history[0].name).toBe('새 이름')
    expect(api.history.rename).toHaveBeenCalledTimes(1)
  })
})

describe('deleteHistory() — AC-8', () => {
  it('낙관적 목록 제거 + remove 1회', () => {
    const H1 = makeHistory('tab_h1', 'H1', '2026-06-15T10:00:00.000Z')
    const H2 = makeHistory('tab_h2', 'H2', '2026-06-14T10:00:00.000Z')
    useWorkspaceStore.setState({ history: [H1, H2] })
    vi.mocked(api.history.remove).mockResolvedValue({ ok: true })

    useWorkspaceStore.getState().deleteHistory('tab_h1')

    expect(useWorkspaceStore.getState().history).toEqual([H2])
    expect(api.history.remove).toHaveBeenCalledExactlyOnceWith('tab_h1')
  })
})
