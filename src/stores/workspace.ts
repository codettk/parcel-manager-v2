import { create } from 'zustand'
import { api } from '../lib/api'
import type { ColorLabel } from '../types/api/colors'
import type { Group, ParcelOverride } from '../types/api/tabState'
import type { Tab } from '../types/api/tabs'
import { isClearedOverride, normalizeOverride } from '../utils/override'
import { useUiStore } from './ui'

export const ACTIVE_TAB_STORAGE_KEY = 'bogugot_v2_active_tab'

/** upsertParcel 입력 — 변경하려는 필드만. 전송 시 기존 override와 병합된 전체 필드가 나간다 */
export type ParcelPatch = Partial<ParcelOverride>

const EMPTY_OVERRIDE: ParcelOverride = {
  color: null,
  style: null,
  name: null,
  memo: null,
  pinned: false,
  icon: null,
}

export interface WorkspaceState {
  tabs: Tab[]
  activeTabId: string | null
  overrides: Record<string, ParcelOverride>
  groups: Record<string, Group>
  colorLabels: ColorLabel[]
  bootError: string | null
  /** 부팅 시퀀스 — tabs/colors 병렬 로드 → activeTabId 결정(C-1) → tabState 로드 → 입력 해제 */
  boot: () => Promise<void>
  /** 탭 전환 — localStorage 기록 + tabState 재로드 (재로드 동안 isInitializing true — C-4) */
  setActiveTab: (tabId: string) => Promise<void>
  /** 낙관적 upsert — 동기 갱신 후 서버 전송. 실패 시 롤백 없음(v1 보존), console.error 보고 */
  upsertParcel: (parcelId: string, patch: ParcelPatch) => void
  /** 낙관적 upsert — group null이면 삭제 */
  upsertGroup: (groupId: string, group: Group | null) => void
  /** Realtime 수신 반영 (M-6 구독이 호출) — 서버 호출 없음. null = 키 삭제 */
  applyRemoteParcel: (parcelId: string, override: ParcelOverride | null) => void
  applyRemoteGroup: (groupId: string, group: Group | null) => void
  applyRemoteTabs: (tabs: Tab[]) => void
  applyRemoteColors: (colorLabels: ColorLabel[]) => void
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  overrides: {},
  groups: {},
  colorLabels: [],
  bootError: null,

  boot: async () => {
    try {
      const [tabs, colorLabels] = await Promise.all([api.tabs.list(), api.colors.list()])
      if (tabs.length === 0) {
        throw new Error('활성 탭이 없습니다 — 서버 부트스트랩 계약(기본 탭 자동 생성) 위반')
      }
      const stored = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)
      const activeTabId =
        stored !== null && tabs.some((t) => t.tabId === stored) ? stored : tabs[0].tabId
      if (stored !== activeTabId) localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId)

      const { overrides, groups } = await api.tabState.get(activeTabId)
      set({ tabs, colorLabels, activeTabId, overrides, groups, bootError: null })
      useUiStore.getState().setInitializing(false)
    } catch (err) {
      // 실패 시 isInitializing true 유지 — 입력 차단 지속 (재시도 UI는 비범위)
      set({ bootError: err instanceof Error ? err.message : String(err) })
      if (import.meta.env.DEV) console.error('[workspace] 부팅 실패:', err)
    }
  },

  setActiveTab: async (tabId) => {
    useUiStore.getState().setInitializing(true)
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tabId)
    set({ activeTabId: tabId })
    try {
      const { overrides, groups } = await api.tabState.get(tabId)
      set({ overrides, groups })
      useUiStore.getState().setInitializing(false)
    } catch (err) {
      set({ bootError: err instanceof Error ? err.message : String(err) })
      if (import.meta.env.DEV) console.error('[workspace] 탭 상태 로드 실패:', err)
    }
  },

  upsertParcel: (parcelId, patch) => {
    const { activeTabId, overrides } = get()
    if (activeTabId === null) {
      console.error('[workspace] upsertParcel: 부팅 전 호출 무시 —', parcelId)
      return
    }
    // 서버 핸들러는 전체 행 치환 — 병합된 전체 의미 필드를 전송한다 (부분 patch 금지, B-1)
    const merged = normalizeOverride({ ...EMPTY_OVERRIDE, ...overrides[parcelId], ...patch })
    const next = { ...overrides }
    if (isClearedOverride(merged)) delete next[parcelId]
    else next[parcelId] = merged
    set({ overrides: next })
    api.tabState.upsertParcel(activeTabId, parcelId, merged).catch((err: unknown) => {
      console.error('[workspace] 필지 저장 실패:', err)
    })
  },

  upsertGroup: (groupId, group) => {
    const { activeTabId, groups } = get()
    if (activeTabId === null) {
      console.error('[workspace] upsertGroup: 부팅 전 호출 무시 —', groupId)
      return
    }
    const next = { ...groups }
    if (group === null) delete next[groupId]
    else next[groupId] = group
    set({ groups: next })
    api.tabState.upsertGroup(activeTabId, { groupId, group }).catch((err: unknown) => {
      console.error('[workspace] 그룹 저장 실패:', err)
    })
  },

  applyRemoteParcel: (parcelId, override) => {
    const next = { ...get().overrides }
    if (override === null) delete next[parcelId]
    else next[parcelId] = override
    set({ overrides: next })
  },

  applyRemoteGroup: (groupId, group) => {
    const next = { ...get().groups }
    if (group === null) delete next[groupId]
    else next[groupId] = group
    set({ groups: next })
  },

  applyRemoteTabs: (tabs) => set({ tabs }),

  applyRemoteColors: (colorLabels) => set({ colorLabels }),
}))
