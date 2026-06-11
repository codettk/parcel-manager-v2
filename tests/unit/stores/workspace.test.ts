import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { api } from '../../../src/lib/api'
import { ACTIVE_TAB_STORAGE_KEY, useWorkspaceStore } from '../../../src/stores/workspace'
import { useUiStore } from '../../../src/stores/ui'
import type { ColorLabel } from '../../../src/types/api/colors'
import type { Group, ParcelOverride, TabStateResponse } from '../../../src/types/api/tabState'
import type { Tab } from '../../../src/types/api/tabs'

vi.mock('../../../src/lib/api', () => ({
  api: {
    tabs: { list: vi.fn() },
    colors: { list: vi.fn() },
    tabState: { get: vi.fn(), upsertParcel: vi.fn(), upsertGroup: vi.fn() },
  },
}))

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

const OVERRIDE_P1: ParcelOverride = {
  color: 'eco',
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

const STATE_FIXTURE = { overrides: { p1: OVERRIDE_P1 }, groups: { g1: GROUP_G1 } }

let consoleErrorSpy: MockInstance

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

/** 정상 부팅 픽스처를 모킹하고 boot()를 완료한다 */
async function bootWithFixtures(): Promise<void> {
  vi.mocked(api.tabs.list).mockResolvedValue([TAB_A, TAB_B])
  vi.mocked(api.colors.list).mockResolvedValue(COLORS_FIXTURE)
  vi.mocked(api.tabState.get).mockResolvedValue(STATE_FIXTURE)
  await useWorkspaceStore.getState().boot()
}

describe('boot() — 부팅 시퀀스', () => {
  it('AC-1: localStorage 탭 id가 목록에 존재하면 그 탭으로 부팅된다', async () => {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, 'tab_b')
    await bootWithFixtures()

    const s = useWorkspaceStore.getState()
    expect(s.tabs).toEqual([TAB_A, TAB_B])
    expect(s.colorLabels).toEqual(COLORS_FIXTURE)
    expect(s.activeTabId).toBe('tab_b')
    expect(api.tabState.get).toHaveBeenCalledExactlyOnceWith('tab_b')
    expect(s.overrides).toEqual({ p1: OVERRIDE_P1 })
    expect(s.groups).toEqual({ g1: GROUP_G1 })
    expect(useUiStore.getState().isInitializing).toBe(false)
  })

  it('AC-2: localStorage가 없으면 첫 탭으로 폴백하고 localStorage를 갱신한다 (C-1)', async () => {
    await bootWithFixtures()

    expect(useWorkspaceStore.getState().activeTabId).toBe('tab_a')
    expect(localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)).toBe('tab_a')
    expect(api.tabState.get).toHaveBeenCalledExactlyOnceWith('tab_a')
  })

  it('AC-2: localStorage 탭 id가 목록에 없으면 첫 탭으로 폴백한다 (C-1)', async () => {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, 'tab_ghost')
    await bootWithFixtures()

    expect(useWorkspaceStore.getState().activeTabId).toBe('tab_a')
    expect(localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)).toBe('tab_a')
  })

  it('AC-3: 부팅 실패 시 bootError 설정 + isInitializing 유지 + 탭 입력 차단 (C-4)', async () => {
    vi.mocked(api.tabs.list).mockRejectedValue(new Error('네트워크 실패'))
    vi.mocked(api.colors.list).mockResolvedValue(COLORS_FIXTURE)

    await useWorkspaceStore.getState().boot()

    expect(useWorkspaceStore.getState().bootError).toBe('네트워크 실패')
    expect(useUiStore.getState().isInitializing).toBe(true)

    useUiStore.getState().tapParcel('p1')
    expect(useUiStore.getState().selectedParcelId).toBeNull()

    useUiStore.getState().setInitializing(false)
    useUiStore.getState().tapParcel('p1')
    expect(useUiStore.getState().selectedParcelId).toBe('p1')
    useUiStore.getState().tapParcel(null)
    expect(useUiStore.getState().selectedParcelId).toBeNull()
  })
})

describe('setActiveTab() — 탭 전환', () => {
  it('localStorage 기록 + tabState 재로드, 재로드 동안 isInitializing true (C-4)', async () => {
    await bootWithFixtures()

    let resolveState!: (v: TabStateResponse) => void
    vi.mocked(api.tabState.get).mockImplementationOnce(
      () => new Promise((resolve) => (resolveState = resolve)),
    )
    const switching = useWorkspaceStore.getState().setActiveTab('tab_b')

    expect(useUiStore.getState().isInitializing).toBe(true)
    expect(useWorkspaceStore.getState().activeTabId).toBe('tab_b')
    expect(localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)).toBe('tab_b')

    resolveState({ overrides: {}, groups: {} })
    await switching

    expect(useWorkspaceStore.getState().overrides).toEqual({})
    expect(useWorkspaceStore.getState().groups).toEqual({})
    expect(useUiStore.getState().isInitializing).toBe(false)
  })
})

describe('upsertParcel() — 낙관적 업데이트 (AC-5)', () => {
  it('서버 응답 전에 overrides가 동기 갱신되고 api가 1회 호출된다', async () => {
    await bootWithFixtures()
    // 미해결 Promise — 동기 갱신(서버 응답 전)을 증명
    vi.mocked(api.tabState.upsertParcel).mockReturnValue(new Promise(() => {}))

    useWorkspaceStore.getState().upsertParcel('p1', { color: 'red', style: 'fill' })

    const merged: ParcelOverride = {
      color: 'red',
      style: 'fill',
      name: null,
      memo: null,
      pinned: false,
      icon: null,
    }
    expect(useWorkspaceStore.getState().overrides['p1']).toEqual(merged)
    // 서버 핸들러는 전체 행 치환 — 병합된 전체 의미 필드가 전송돼야 한다 (부분 patch 금지, B-1)
    expect(api.tabState.upsertParcel).toHaveBeenCalledExactlyOnceWith('tab_a', 'p1', merged)
  })

  it('부분 patch에도 기존 필드(color/memo)가 병합돼 전체 필드로 전송된다 (B-1)', async () => {
    await bootWithFixtures()
    vi.mocked(api.tabState.upsertParcel).mockResolvedValue({ ok: true })
    useWorkspaceStore.getState().applyRemoteParcel('p5', {
      color: 'red',
      style: 'fill',
      name: null,
      memo: '중요',
      pinned: false,
      icon: null,
    })

    useWorkspaceStore.getState().upsertParcel('p5', { name: '논' })

    const merged: ParcelOverride = {
      color: 'red',
      style: 'fill',
      name: '논',
      memo: '중요',
      pinned: false,
      icon: null,
    }
    expect(useWorkspaceStore.getState().overrides['p5']).toEqual(merged)
    expect(api.tabState.upsertParcel).toHaveBeenCalledExactlyOnceWith('tab_a', 'p5', merged)
  })

  it('모든 의미 필드 null + pinned=false면 키가 삭제된다 (서버 clear 계약 동형)', async () => {
    await bootWithFixtures()
    vi.mocked(api.tabState.upsertParcel).mockResolvedValue({ ok: true })

    useWorkspaceStore.getState().upsertParcel('p1', {
      color: null,
      style: null,
      name: null,
      memo: null,
      pinned: false,
      icon: null,
    })

    expect(useWorkspaceStore.getState().overrides).not.toHaveProperty('p1')
  })

  it('api reject 시에도 상태는 롤백되지 않고 console.error로 보고한다', async () => {
    await bootWithFixtures()
    vi.mocked(api.tabState.upsertParcel).mockRejectedValue(new Error('저장 실패'))

    useWorkspaceStore.getState().upsertParcel('p2', { color: 'red' })
    await vi.waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled())

    expect(useWorkspaceStore.getState().overrides['p2']).toEqual({
      color: 'red',
      style: 'fill', // 서버와 공유하는 normalizeOverride 보정 — color 있고 style 없으면 'fill'
      name: null,
      memo: null,
      pinned: false,
      icon: null,
    })
  })
})

describe('upsertGroup() — 낙관적 업데이트', () => {
  it('값이면 동기 갱신 + api 1회, null이면 키 삭제 + api 1회', async () => {
    await bootWithFixtures()
    vi.mocked(api.tabState.upsertGroup).mockResolvedValue({ ok: true })

    const g2: Group = { name: '그룹2', memo: null, color: 'eco', style: 'fill', parcelIds: ['p9'] }
    useWorkspaceStore.getState().upsertGroup('g2', g2)
    expect(useWorkspaceStore.getState().groups['g2']).toEqual(g2)
    expect(api.tabState.upsertGroup).toHaveBeenCalledWith('tab_a', { groupId: 'g2', group: g2 })

    useWorkspaceStore.getState().upsertGroup('g1', null)
    expect(useWorkspaceStore.getState().groups).not.toHaveProperty('g1')
    expect(api.tabState.upsertGroup).toHaveBeenCalledWith('tab_a', { groupId: 'g1', group: null })
    expect(api.tabState.upsertGroup).toHaveBeenCalledTimes(2)
  })
})

describe('applyRemote* — Realtime 수신 반영 (AC-6, M-6 계약)', () => {
  it('값 갱신·null 삭제·목록 교체가 api 호출 없이 일어난다', async () => {
    await bootWithFixtures()
    vi.clearAllMocks()

    const store = useWorkspaceStore.getState()
    const override: ParcelOverride = {
      color: 'sun',
      style: 'border',
      name: '원격',
      memo: null,
      pinned: true,
      icon: null,
    }
    store.applyRemoteParcel('p9', override)
    expect(useWorkspaceStore.getState().overrides['p9']).toEqual(override)
    store.applyRemoteParcel('p9', null)
    expect(useWorkspaceStore.getState().overrides).not.toHaveProperty('p9')

    const group: Group = { name: '원격그룹', memo: null, color: null, style: 'fill', parcelIds: [] }
    store.applyRemoteGroup('g9', group)
    expect(useWorkspaceStore.getState().groups['g9']).toEqual(group)
    store.applyRemoteGroup('g9', null)
    expect(useWorkspaceStore.getState().groups).not.toHaveProperty('g9')

    store.applyRemoteTabs([TAB_B])
    expect(useWorkspaceStore.getState().tabs).toEqual([TAB_B])

    const newColors: ColorLabel[] = [
      { colorId: 'sky', label: '하늘', hex: '#3A7BD5', sortOrder: 0 },
    ]
    store.applyRemoteColors(newColors)
    expect(useWorkspaceStore.getState().colorLabels).toEqual(newColors)

    expect(api.tabs.list).not.toHaveBeenCalled()
    expect(api.colors.list).not.toHaveBeenCalled()
    expect(api.tabState.get).not.toHaveBeenCalled()
    expect(api.tabState.upsertParcel).not.toHaveBeenCalled()
    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
  })
})
