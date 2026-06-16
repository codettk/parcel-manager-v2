import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabBar } from '../../../src/components/ui'
import { api } from '../../../src/lib/api'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { Tab } from '../../../src/types/api/tabs'

// 명세: docs/specs/tab-workspace.md — App의 TabBar 결선을 실제 스토어 액션에 묶어 검증 (AC-2~4).
// App 전체 렌더는 MapCanvas의 parcels.json 로드를 포함하므로, App과 동일한 결선만 떼어 테스트한다.
vi.mock('../../../src/lib/api', () => ({
  api: {
    tabs: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    colors: { list: vi.fn() },
    history: { list: vi.fn(), rename: vi.fn(), restore: vi.fn(), remove: vi.fn() },
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

/** App.tsx의 TabBar 결선을 그대로 떼어낸 하네스 */
function TabBarHarness() {
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTabId = useWorkspaceStore((s) => s.activeTabId)
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab)
  const createTab = useWorkspaceStore((s) => s.createTab)
  const renameTab = useWorkspaceStore((s) => s.renameTab)
  const softCloseTab = useWorkspaceStore((s) => s.softCloseTab)
  if (activeTabId === null) return null
  return (
    <TabBar
      tabs={tabs.map((t) => ({ id: t.tabId, name: t.name }))}
      activeId={activeTabId}
      onSelect={(id) => void setActiveTab(id)}
      onAdd={() => void createTab()}
      onClose={(id) => void softCloseTab(id)}
      onRename={renameTab}
    />
  )
}

let consoleErrorSpy: MockInstance

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(api.tabState.get).mockResolvedValue({ overrides: {}, groups: {} })
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('AC-2: + 버튼 → 탭 생성·전환', () => {
  it('+ 버튼 → 활성 탭 2개 + 새 탭 활성', async () => {
    useWorkspaceStore.setState({ tabs: [makeTab('tab_a', '탭 A', 0)], activeTabId: 'tab_a' })
    vi.mocked(api.tabs.create).mockResolvedValue(makeTab('tab_new', '새 작업공간', 1))
    render(<TabBarHarness />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '탭 추가' }))

    expect(useWorkspaceStore.getState().tabs).toHaveLength(2)
    expect(useWorkspaceStore.getState().activeTabId).toBe('tab_new')
    const newTab = screen.getByRole('tab', { name: /새 작업공간/ })
    expect(newTab).toHaveAttribute('aria-selected', 'true')
  })
})

describe('AC-3: 활성 탭 더블클릭 인라인 편집', () => {
  it('더블클릭 → Enter → update({name}) 1회 + 라벨 변경', async () => {
    useWorkspaceStore.setState({ tabs: [makeTab('tab_a', '탭 A', 0)], activeTabId: 'tab_a' })
    vi.mocked(api.tabs.update).mockResolvedValue(makeTab('tab_a', '내 작업', 0))
    render(<TabBarHarness />)
    const user = userEvent.setup()

    await user.dblClick(screen.getByRole('tab', { name: /탭 A/ }))
    const input = screen.getByLabelText('탭 이름 편집')
    await user.clear(input)
    await user.type(input, '내 작업{Enter}')

    expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith('tab_a', { name: '내 작업' })
    expect(useWorkspaceStore.getState().tabs[0].name).toBe('내 작업')
  })

  it('Escape → update 미호출', async () => {
    useWorkspaceStore.setState({ tabs: [makeTab('tab_a', '탭 A', 0)], activeTabId: 'tab_a' })
    render(<TabBarHarness />)
    const user = userEvent.setup()

    await user.dblClick(screen.getByRole('tab', { name: /탭 A/ }))
    const input = screen.getByLabelText('탭 이름 편집')
    await user.type(input, '바뀐{Escape}')

    expect(api.tabs.update).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().tabs[0].name).toBe('탭 A')
  })
})

describe('AC-4: 소프트 클로즈 마지막 탭 가드', () => {
  it('활성 탭 1개 — × 눌러도 close 미호출', async () => {
    useWorkspaceStore.setState({ tabs: [makeTab('tab_a', '탭 A', 0)], activeTabId: 'tab_a' })
    render(<TabBarHarness />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '탭 A 닫기' }))

    expect(api.tabs.remove).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1)
  })

  it('활성 탭 2개 — 비활성 탭 × → close 1회 + 탭 바에서 사라짐', async () => {
    useWorkspaceStore.setState({
      tabs: [makeTab('tab_a', '탭 A', 0), makeTab('tab_b', '탭 B', 1)],
      activeTabId: 'tab_a',
    })
    vi.mocked(api.tabs.remove).mockResolvedValue({ ok: true })
    render(<TabBarHarness />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '탭 B 닫기' }))

    expect(api.tabs.remove).toHaveBeenCalledExactlyOnceWith('tab_b')
    expect(useWorkspaceStore.getState().tabs).toEqual([makeTab('tab_a', '탭 A', 0)])
    expect(screen.queryByRole('tab', { name: /탭 B/ })).not.toBeInTheDocument()
  })
})
