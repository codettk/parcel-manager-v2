import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../src/lib/api'
import {
  createRealtimeSync,
  type PostgresChangesFilter,
  type PostgresChangesPayload,
  type RealtimeChannelLike,
  type RealtimeClientLike,
  type RealtimeSync,
} from '../../../src/lib/realtime'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { Tab } from '../../../src/types/api/tabs'

// 명세: docs/specs/tab-workspace.md AC-9 (C-1: 활성 탭이 원격에서 닫히면 첫 탭 폴백)
//
// AC-9는 다른 클라이언트의 소프트 클로즈 `tabs` Realtime 이벤트 → refetch 결과에서 활성탭 소실 →
// 첫 탭으로 setActiveTab 복구를 요구한다. Realtime 이벤트 모킹이 E2E로는 어려워(명세 §AC-9 단서)
// 단위로 내려 등가 검증한다 — refetchTabs가 활성탭 미존재 시 첫 탭 폴백을 수행하는지.
// (tests/unit/lib/realtime.test.ts "AC-8"과 동일 경로의 M-16 추적용 테스트.)

const SELF_CLIENT_ID = 'client_self'
const OTHER_CLIENT_ID = 'client_other'

vi.mock('../../../src/lib/api', () => ({
  api: {
    tabs: { list: vi.fn() },
    colors: { list: vi.fn() },
    tabState: { get: vi.fn() },
    config: { get: vi.fn() },
  },
  getClientId: vi.fn(() => 'client_self'),
}))

class MockChannel implements RealtimeChannelLike {
  readonly name: string
  handler: ((payload: PostgresChangesPayload) => void) | null = null
  constructor(name: string) {
    this.name = name
  }
  on(
    _type: 'postgres_changes',
    _filter: PostgresChangesFilter,
    callback: (payload: PostgresChangesPayload) => void,
  ): RealtimeChannelLike {
    this.handler = callback
    return this
  }
  subscribe(): RealtimeChannelLike {
    return this
  }
  emit(payload: PostgresChangesPayload): void {
    this.handler?.(payload)
  }
}

interface MockClient {
  client: RealtimeClientLike
  find(name: string): MockChannel
}

function createMockClient(): MockClient {
  const created: MockChannel[] = []
  return {
    client: {
      channel(name: string): RealtimeChannelLike {
        const ch = new MockChannel(name)
        created.push(ch)
        return ch
      },
      removeChannel(): void {},
    },
    find(name: string): MockChannel {
      const ch = [...created].reverse().find((c) => c.name === name)
      if (ch === undefined) throw new Error(`채널 없음: ${name}`)
      return ch
    },
  }
}

function makeTab(tabId: string, name: string, sortOrder: number): Tab {
  return {
    tabId,
    name,
    sortOrder,
    closedAt: null,
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedBy: null,
    updatedAt: '2026-06-11T00:00:00.000Z',
  }
}

const TAB_A = makeTab('tab_a', '탭 A', 0)
const TAB_B = makeTab('tab_b', '탭 B', 1)

let createdSyncs: RealtimeSync[] = []

function startSync(): MockClient & { sync: RealtimeSync } {
  const mock = createMockClient()
  const sync = createRealtimeSync({ client: mock.client })
  sync.start()
  createdSyncs.push(sync)
  return { ...mock, sync }
}

function updatePayload(row: Record<string, unknown>): PostgresChangesPayload {
  return { eventType: 'UPDATE', new: row, old: {} }
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // 활성 탭 A로 부팅된 상태 (A·B 두 탭)
  useWorkspaceStore.setState({
    tabs: [TAB_A, TAB_B],
    activeTabId: 'tab_a',
    overrides: {},
    groups: {},
    colorLabels: [],
  })
})

afterEach(() => {
  for (const sync of createdSyncs) sync.stop()
  createdSyncs = []
  vi.restoreAllMocks()
})

describe('AC-9: 활성 탭이 원격에서 닫히면 첫 탭으로 폴백한다 (C-1 런타임)', () => {
  it('refetch 결과에 활성 탭(tab_a)이 없으면 목록 첫 탭(tab_b)으로 setActiveTab 한다', async () => {
    // 다른 클라이언트가 tab_a를 소프트 클로즈 → refetch 결과는 [tab_b]뿐
    vi.mocked(api.tabs.list).mockResolvedValue([TAB_B])
    vi.mocked(api.tabState.get).mockResolvedValue({ overrides: {}, groups: {} })
    const mock = startSync()

    mock.find('tabs_changes').emit(updatePayload({ tab_id: 'tab_a', updated_by: OTHER_CLIENT_ID }))

    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().activeTabId).toBe('tab_b')
    })
    // 활성탭이 닫힌 탭(tab_a)에 머무르지 않고 유효 활성 탭(tab_b)으로 복구된다
    expect(api.tabState.get).toHaveBeenCalledExactlyOnceWith('tab_b')
    expect(useWorkspaceStore.getState().tabs).toEqual([TAB_B])
  })

  it('refetch 결과에 활성 탭이 여전히 있으면 폴백하지 않는다 (비활성 탭만 닫힘)', async () => {
    vi.mocked(api.tabs.list).mockResolvedValue([TAB_A, TAB_B])
    const mock = startSync()

    mock.find('tabs_changes').emit(updatePayload({ tab_id: 'tab_b', updated_by: OTHER_CLIENT_ID }))

    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().tabs).toEqual([TAB_A, TAB_B])
    })
    expect(api.tabState.get).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().activeTabId).toBe('tab_a')
  })

  it('자기 clientId가 보낸 이벤트는 에코 가드로 refetch하지 않는다', async () => {
    const mock = startSync()

    mock.find('tabs_changes').emit(updatePayload({ tab_id: 'tab_a', updated_by: SELF_CLIENT_ID }))

    expect(api.tabs.list).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().activeTabId).toBe('tab_a')
  })
})
