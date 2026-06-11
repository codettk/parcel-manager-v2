import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
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
import type { ColorLabel } from '../../../src/types/api/colors'
import type { Group, ParcelOverride } from '../../../src/types/api/tabState'
import type { Tab } from '../../../src/types/api/tabs'

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

// ── mock supabase 클라이언트 — RealtimeClientLike를 구현하고 payload/status 주입을 노출

class MockChannel implements RealtimeChannelLike {
  readonly name: string
  filter: PostgresChangesFilter | null = null
  handler: ((payload: PostgresChangesPayload) => void) | null = null
  statusCallback: ((status: string) => void) | null = null
  subscribeCalls = 0

  constructor(name: string) {
    this.name = name
  }

  on(
    _type: 'postgres_changes',
    filter: PostgresChangesFilter,
    callback: (payload: PostgresChangesPayload) => void,
  ): RealtimeChannelLike {
    this.filter = filter
    this.handler = callback
    return this
  }

  subscribe(callback?: (status: string) => void): RealtimeChannelLike {
    this.subscribeCalls += 1
    this.statusCallback = callback ?? null
    return this
  }

  emit(payload: PostgresChangesPayload): void {
    this.handler?.(payload)
  }

  setStatus(status: string): void {
    this.statusCallback?.(status)
  }
}

interface MockClient {
  client: RealtimeClientLike
  created: MockChannel[]
  removed: MockChannel[]
  /** 같은 이름으로 재생성될 수 있어 가장 최근 채널을 찾는다 */
  find(name: string): MockChannel
}

function createMockClient(): MockClient {
  const created: MockChannel[] = []
  const removed: MockChannel[] = []
  return {
    client: {
      channel(name: string): RealtimeChannelLike {
        const ch = new MockChannel(name)
        created.push(ch)
        return ch
      },
      removeChannel(channel: RealtimeChannelLike): void {
        removed.push(channel as MockChannel)
      },
    },
    created,
    removed,
    find(name: string): MockChannel {
      const ch = [...created].reverse().find((c) => c.name === name)
      if (ch === undefined) throw new Error(`채널 없음: ${name}`)
      return ch
    },
  }
}

// ── 픽스처

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

const COLORS_FIXTURE: ColorLabel[] = [
  { colorId: 'eco', label: '생태', hex: '#2F6B4F', sortOrder: 0 },
  { colorId: 'sun', label: '양지', hex: '#E8A13A', sortOrder: 1 },
]

const OVERRIDE_PINNED_X: ParcelOverride = {
  color: 'eco',
  style: 'fill',
  name: null,
  memo: null,
  pinned: true,
  icon: 'star',
}

const OVERRIDE_PLAIN_Y: ParcelOverride = {
  color: 'sun',
  style: 'fill',
  name: null,
  memo: null,
  pinned: false,
  icon: null,
}

const GROUP_G1: Group = {
  name: '그룹1',
  memo: null,
  color: 'sun',
  style: 'border',
  parcelIds: ['p2', 'p3'],
}

function seedBootedWorkspace(): void {
  useWorkspaceStore.setState({
    tabs: [TAB_A, TAB_B],
    activeTabId: 'tab_a',
    overrides: { pX: OVERRIDE_PINNED_X, pY: OVERRIDE_PLAIN_Y },
    groups: { g1: GROUP_G1 },
    colorLabels: COLORS_FIXTURE,
  })
}

function insertPayload(row: Record<string, unknown>): PostgresChangesPayload {
  return { eventType: 'INSERT', new: row, old: {} }
}

function updatePayload(row: Record<string, unknown>): PostgresChangesPayload {
  return { eventType: 'UPDATE', new: row, old: {} }
}

function deletePayload(old: Record<string, unknown>): PostgresChangesPayload {
  return { eventType: 'DELETE', new: {}, old }
}

/** 테스트가 만든 sync 추적 — afterEach stop()으로 전역 스토어 subscribe 누수를 막는다 */
let createdSyncs: RealtimeSync[] = []

function startSync(): MockClient & { sync: RealtimeSync } {
  const mock = createMockClient()
  const sync = createRealtimeSync({ client: mock.client })
  sync.start()
  createdSyncs.push(sync)
  return { ...mock, sync }
}

function subscribeAll(mock: MockClient): void {
  for (const ch of mock.created) ch.setStatus('SUBSCRIBED')
}

let consoleErrorSpy: MockInstance

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  seedBootedWorkspace()
})

afterEach(() => {
  for (const sync of createdSyncs) sync.stop()
  createdSyncs = []
  consoleErrorSpy.mockRestore()
})

describe('AC-1: 채널 4개 구성', () => {
  it('탭 스코프 2개는 tab_id 필터, tabs/colors는 무필터로 postgres_changes *를 구독한다', () => {
    const mock = startSync()

    expect(mock.created).toHaveLength(4)
    expect(mock.created.map((c) => c.name)).toEqual([
      'parcel_settings_changes',
      'parcel_groups_changes',
      'tabs_changes',
      'color_labels_changes',
    ])
    expect(mock.find('parcel_settings_changes').filter).toEqual({
      event: '*',
      schema: 'public',
      table: 'parcel_settings',
      filter: 'tab_id=eq.tab_a',
    })
    expect(mock.find('parcel_groups_changes').filter).toEqual({
      event: '*',
      schema: 'public',
      table: 'parcel_groups',
      filter: 'tab_id=eq.tab_a',
    })
    expect(mock.find('tabs_changes').filter).toEqual({
      event: '*',
      schema: 'public',
      table: 'tabs',
    })
    expect(mock.find('color_labels_changes').filter).toEqual({
      event: '*',
      schema: 'public',
      table: 'color_labels',
    })
    for (const ch of mock.created) expect(ch.subscribeCalls).toBe(1)
  })
})

describe('AC-2: 에코 가드 — 자기 clientId INSERT/UPDATE 무시 (4테이블)', () => {
  it('settings/groups는 상태가 불변, tabs/colors는 refetch가 발생하지 않는다', async () => {
    const mock = startSync()
    subscribeAll(mock)
    const before = useWorkspaceStore.getState()

    const echoSettingsRow = {
      tab_id: 'tab_a',
      parcel_local_id: 'pY',
      color: 'eco',
      style: 'border',
      name: '에코',
      memo: null,
      pinned: false,
      icon: null,
      updated_by: SELF_CLIENT_ID,
    }
    const echoGroupRow = {
      group_id: 'g1',
      tab_id: 'tab_a',
      name: '에코그룹',
      memo: null,
      color: 'eco',
      style: 'fill',
      parcel_ids: ['p9'],
      updated_by: SELF_CLIENT_ID,
    }
    mock.find('parcel_settings_changes').emit(insertPayload(echoSettingsRow))
    mock.find('parcel_settings_changes').emit(updatePayload(echoSettingsRow))
    mock.find('parcel_groups_changes').emit(insertPayload(echoGroupRow))
    mock.find('parcel_groups_changes').emit(updatePayload(echoGroupRow))
    mock.find('tabs_changes').emit(insertPayload({ tab_id: 'tab_b', updated_by: SELF_CLIENT_ID }))
    mock.find('tabs_changes').emit(updatePayload({ tab_id: 'tab_b', updated_by: SELF_CLIENT_ID }))
    mock
      .find('color_labels_changes')
      .emit(insertPayload({ color_id: 'eco', updated_by: SELF_CLIENT_ID }))
    mock
      .find('color_labels_changes')
      .emit(updatePayload({ color_id: 'eco', updated_by: SELF_CLIENT_ID }))
    await Promise.resolve()

    const after = useWorkspaceStore.getState()
    expect(after.overrides).toEqual(before.overrides)
    expect(after.groups).toEqual(before.groups)
    expect(after.tabs).toEqual(before.tabs)
    expect(after.colorLabels).toEqual(before.colorLabels)
    expect(api.tabs.list).not.toHaveBeenCalled()
    expect(api.colors.list).not.toHaveBeenCalled()
  })
})

describe('AC-3: parcel_settings INSERT/UPDATE — snake_case → ParcelOverride 변환', () => {
  it('타 클라이언트 행이 camelCase override로 반영된다', () => {
    const mock = startSync()

    mock.find('parcel_settings_changes').emit(
      insertPayload({
        tab_id: 'tab_a',
        parcel_local_id: 'p_new',
        color: 'eco',
        style: 'border',
        name: '논',
        memo: '메모',
        pinned: false,
        icon: null,
        updated_by: OTHER_CLIENT_ID,
        updated_at: '2026-06-11T01:00:00.000Z',
      }),
    )

    const expected: ParcelOverride = {
      color: 'eco',
      style: 'border',
      name: '논',
      memo: '메모',
      pinned: false,
      icon: null,
    }
    expect(useWorkspaceStore.getState().overrides['p_new']).toEqual(expected)
  })

  it('모든 의미 필드 null + pinned=false 행은 null(키 삭제)로 전달된다', () => {
    const mock = startSync()

    mock.find('parcel_settings_changes').emit(
      updatePayload({
        tab_id: 'tab_a',
        parcel_local_id: 'pY',
        color: null,
        style: null,
        name: null,
        memo: null,
        pinned: false,
        icon: null,
        updated_by: OTHER_CLIENT_ID,
      }),
    )

    expect(useWorkspaceStore.getState().overrides).not.toHaveProperty('pY')
  })
})

describe('AC-4: parcel_settings DELETE — 탭 격리 + pinned 보호', () => {
  it('old.tab_id가 다르면 무시한다 (DELETE 필터 미적용 보완)', () => {
    const mock = startSync()

    mock
      .find('parcel_settings_changes')
      .emit(deletePayload({ tab_id: 'tab_x', parcel_local_id: 'pY' }))

    expect(useWorkspaceStore.getState().overrides['pY']).toEqual(OVERRIDE_PLAIN_Y)
  })

  it('일반 필지 Y는 삭제되고 pinned 필지 X는 보존된다', () => {
    const mock = startSync()

    mock
      .find('parcel_settings_changes')
      .emit(deletePayload({ tab_id: 'tab_a', parcel_local_id: 'pY' }))
    mock
      .find('parcel_settings_changes')
      .emit(deletePayload({ tab_id: 'tab_a', parcel_local_id: 'pX' }))

    const { overrides } = useWorkspaceStore.getState()
    expect(overrides).not.toHaveProperty('pY')
    expect(overrides['pX']).toEqual(OVERRIDE_PINNED_X)
  })
})

describe('AC-5: parcel_groups — Group 변환 + DELETE', () => {
  it('INSERT/UPDATE 행이 Group(parcelIds)으로 반영된다', () => {
    const mock = startSync()

    mock.find('parcel_groups_changes').emit(
      insertPayload({
        group_id: 'g_new',
        tab_id: 'tab_a',
        name: '새그룹',
        memo: '그룹메모',
        color: 'eco',
        style: 'border',
        parcel_ids: ['p7', 'p8'],
        updated_by: OTHER_CLIENT_ID,
      }),
    )

    const expected: Group = {
      name: '새그룹',
      memo: '그룹메모',
      color: 'eco',
      style: 'border',
      parcelIds: ['p7', 'p8'],
    }
    expect(useWorkspaceStore.getState().groups['g_new']).toEqual(expected)
  })

  it('DELETE는 applyRemoteGroup(old.group_id, null) — 키가 삭제된다', () => {
    const mock = startSync()

    mock.find('parcel_groups_changes').emit(deletePayload({ group_id: 'g1' }))

    expect(useWorkspaceStore.getState().groups).not.toHaveProperty('g1')
  })
})

describe('AC-6: tabs/colors 비에코 이벤트 → 목록 refetch 1회', () => {
  it('tabs 이벤트 시 api.tabs.list 1회 호출 후 applyRemoteTabs', async () => {
    vi.mocked(api.tabs.list).mockResolvedValue([TAB_A, TAB_B])
    const mock = startSync()

    mock.find('tabs_changes').emit(updatePayload({ tab_id: 'tab_b', updated_by: OTHER_CLIENT_ID }))

    await vi.waitFor(() => expect(useWorkspaceStore.getState().tabs).toEqual([TAB_A, TAB_B]))
    expect(api.tabs.list).toHaveBeenCalledTimes(1)
  })

  it('colors 이벤트 시 api.colors.list 1회 호출 후 applyRemoteColors', async () => {
    const newColors: ColorLabel[] = [
      { colorId: 'sky', label: '하늘', hex: '#3A7BD5', sortOrder: 0 },
    ]
    vi.mocked(api.colors.list).mockResolvedValue(newColors)
    const mock = startSync()

    mock
      .find('color_labels_changes')
      .emit(insertPayload({ color_id: 'sky', updated_by: OTHER_CLIENT_ID }))

    await vi.waitFor(() => expect(useWorkspaceStore.getState().colorLabels).toEqual(newColors))
    expect(api.colors.list).toHaveBeenCalledTimes(1)
  })
})

describe('AC-7(클라이언트): color_labels DELETE 에코 가드 — old.updated_by', () => {
  it('자기 clientId면 refetch가 발생하지 않는다', async () => {
    const mock = startSync()

    mock
      .find('color_labels_changes')
      .emit(deletePayload({ color_id: 'eco', updated_by: SELF_CLIENT_ID }))
    await Promise.resolve()

    expect(api.colors.list).not.toHaveBeenCalled()
  })

  it('타 클라이언트면 colors refetch가 1회 발생한다', async () => {
    const newColors: ColorLabel[] = [
      { colorId: 'sun', label: '양지', hex: '#E8A13A', sortOrder: 0 },
    ]
    vi.mocked(api.colors.list).mockResolvedValue(newColors)
    const mock = startSync()

    mock
      .find('color_labels_changes')
      .emit(deletePayload({ color_id: 'eco', updated_by: OTHER_CLIENT_ID }))

    await vi.waitFor(() => expect(useWorkspaceStore.getState().colorLabels).toEqual(newColors))
    expect(api.colors.list).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8: 활성 탭 원격 닫힘 — 첫 탭 폴백', () => {
  it('refetch 결과에 activeTabId가 없으면 setActiveTab(첫 탭)이 호출된다', async () => {
    vi.mocked(api.tabs.list).mockResolvedValue([TAB_B])
    vi.mocked(api.tabState.get).mockResolvedValue({ overrides: {}, groups: {} })
    const mock = startSync()

    mock.find('tabs_changes').emit(updatePayload({ tab_id: 'tab_a', updated_by: OTHER_CLIENT_ID }))

    await vi.waitFor(() => expect(useWorkspaceStore.getState().activeTabId).toBe('tab_b'))
    expect(api.tabState.get).toHaveBeenCalledExactlyOnceWith('tab_b')
    expect(useWorkspaceStore.getState().tabs).toEqual([TAB_B])
  })

  it('결과에 activeTabId가 있으면 setActiveTab이 호출되지 않는다', async () => {
    vi.mocked(api.tabs.list).mockResolvedValue([TAB_A, TAB_B])
    const mock = startSync()

    mock.find('tabs_changes').emit(updatePayload({ tab_id: 'tab_b', updated_by: OTHER_CLIENT_ID }))

    await vi.waitFor(() => expect(useWorkspaceStore.getState().tabs).toEqual([TAB_A, TAB_B]))
    expect(api.tabState.get).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().activeTabId).toBe('tab_a')
  })
})

describe('AC-9: 탭 전환 재구독 — 탭 스코프 채널 2개만', () => {
  it('removeChannel 후 새 필터로 재구독하고 tabs/colors 채널은 유지한다', async () => {
    vi.mocked(api.tabState.get).mockResolvedValue({ overrides: {}, groups: {} })
    const mock = startSync()
    const oldSettings = mock.find('parcel_settings_changes')
    const oldGroups = mock.find('parcel_groups_changes')
    const tabsChannel = mock.find('tabs_changes')
    const colorsChannel = mock.find('color_labels_changes')

    await useWorkspaceStore.getState().setActiveTab('tab_b')

    expect(mock.removed).toEqual([oldSettings, oldGroups])
    expect(mock.removed).not.toContain(tabsChannel)
    expect(mock.removed).not.toContain(colorsChannel)
    expect(mock.created).toHaveLength(6)
    expect(mock.find('parcel_settings_changes')).not.toBe(oldSettings)
    expect(mock.find('parcel_settings_changes').filter).toEqual({
      event: '*',
      schema: 'public',
      table: 'parcel_settings',
      filter: 'tab_id=eq.tab_b',
    })
    expect(mock.find('parcel_groups_changes').filter).toEqual({
      event: '*',
      schema: 'public',
      table: 'parcel_groups',
      filter: 'tab_id=eq.tab_b',
    })
    expect(mock.find('parcel_settings_changes').subscribeCalls).toBe(1)
    expect(mock.find('parcel_groups_changes').subscribeCalls).toBe(1)
  })
})

describe('AC-10: 연결 상태 머신 (ui 스토어 realtimeStatus)', () => {
  function status(): string {
    return useUiStore.getState().realtimeStatus
  }

  it('disabled → connecting → subscribed → error → 복구 → 재구독 connecting → subscribed', async () => {
    expect(status()).toBe('disabled')

    vi.mocked(api.tabState.get).mockResolvedValue({ overrides: {}, groups: {} })
    const mock = startSync()
    expect(status()).toBe('connecting')

    // 4채널 중 3개만 SUBSCRIBED — 아직 connecting
    mock.created[0].setStatus('SUBSCRIBED')
    mock.created[1].setStatus('SUBSCRIBED')
    mock.created[2].setStatus('SUBSCRIBED')
    expect(status()).toBe('connecting')

    mock.created[3].setStatus('SUBSCRIBED')
    expect(status()).toBe('subscribed')

    mock.created[2].setStatus('CHANNEL_ERROR')
    expect(status()).toBe('error')

    mock.created[2].setStatus('SUBSCRIBED')
    expect(status()).toBe('subscribed')

    mock.created[3].setStatus('TIMED_OUT')
    expect(status()).toBe('error')

    mock.created[3].setStatus('SUBSCRIBED')
    expect(status()).toBe('subscribed')

    // 탭 전환 재구독 — 새 탭 스코프 채널 2개가 pending인 동안 connecting
    await useWorkspaceStore.getState().setActiveTab('tab_b')
    expect(status()).toBe('connecting')

    mock.find('parcel_settings_changes').setStatus('SUBSCRIBED')
    expect(status()).toBe('connecting')
    mock.find('parcel_groups_changes').setStatus('SUBSCRIBED')
    expect(status()).toBe('subscribed')
  })

  it('제거된 채널의 늦은 상태 콜백은 집계에서 무시된다', async () => {
    vi.mocked(api.tabState.get).mockResolvedValue({ overrides: {}, groups: {} })
    const mock = startSync()
    subscribeAll(mock)
    const oldSettings = mock.find('parcel_settings_changes')

    await useWorkspaceStore.getState().setActiveTab('tab_b')
    mock.find('parcel_settings_changes').setStatus('SUBSCRIBED')
    mock.find('parcel_groups_changes').setStatus('SUBSCRIBED')
    expect(useUiStore.getState().realtimeStatus).toBe('subscribed')

    oldSettings.setStatus('CHANNEL_ERROR')
    expect(useUiStore.getState().realtimeStatus).toBe('subscribed')
  })
})

describe('payload 파싱 실패 — 이벤트 무시', () => {
  it('형식이 깨진 settings 행은 상태를 바꾸지 않는다', () => {
    const mock = startSync()
    const before = useWorkspaceStore.getState().overrides

    mock
      .find('parcel_settings_changes')
      .emit(insertPayload({ garbage: true, updated_by: OTHER_CLIENT_ID }))

    expect(useWorkspaceStore.getState().overrides).toEqual(before)
  })
})
