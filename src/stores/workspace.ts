import { create } from 'zustand'
import { genGroupId } from '../features/group/groupId'
import { api } from '../lib/api'
import type { ColorLabel } from '../types/api/colors'
import type { Group, ParcelOverride } from '../types/api/tabState'
import type { Tab } from '../types/api/tabs'
import { isClearedOverride, normalizeOverride } from '../utils/override'
import { useUiStore } from './ui'

export const ACTIVE_TAB_STORAGE_KEY = 'bogugot_v2_active_tab'

/** upsertParcel 입력 — 변경하려는 필드만. 전송 시 기존 override와 병합된 전체 필드가 나간다 */
export type ParcelPatch = Partial<ParcelOverride>

/** 그룹 시트 draft 커밋 입력 — 멤버(parcelIds)는 로컬 그룹의 현재 상태를 쓴다 */
export type GroupDraft = Omit<Group, 'parcelIds'>

/** 그룹 생성 드래프트 트랜잭션 — 저장 전 서버 0회·취소 시 원복의 근거 스냅샷 (v1 pendingGroupCreate 보존) */
export interface PendingGroupCreate {
  groupId: string
  /** 선택에 멤버를 빼앗긴 기존 그룹들의 원본 (취소 시 이 상태로 복원) */
  originalAffectedGroups: Record<string, Group>
}

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
  /** null이 아니면 신규 그룹이 로컬에만 존재하는 드래프트 상태 */
  pendingGroupCreate: PendingGroupCreate | null
  /** 드래프트 시작 — 영향 그룹 스냅샷 + 로컬 groups만 갱신(미리보기) + 멀티선택 종료/그룹 시트 열림. 2개 미만 무시 */
  beginGroupDraft: (parcelIds: string[]) => void
  /** 드래프트 확정 — 영향 그룹(현재 로컬 상태, 삭제됐으면 null)을 먼저 전송 후 신규 그룹 전송 (v1 onSave 순서 보존) */
  commitGroupDraft: (draft: GroupDraft) => void
  /** 드래프트 취소 — 신규 그룹 제거 + 영향 그룹 원본 복원. 서버 호출 0회 */
  cancelGroupDraft: () => void
  /** pending 그룹의 멤버 로컬 갱신 (시트 멤버 제거) — applyRemote와 구분되는 드래프트 전용 경로 */
  updateDraftGroupMembers: (parcelIds: string[]) => void
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

  pendingGroupCreate: null,

  beginGroupDraft: (parcelIds) => {
    if (parcelIds.length < 2) return
    // 이중 호출 방어 — 이전 드래프트의 스냅샷 유실(유령 그룹 잔존) 차단
    if (get().pendingGroupCreate !== null) return
    const { groups } = get()
    const groupId = genGroupId()
    const selected = new Set(parcelIds)
    const originalAffectedGroups: Record<string, Group> = {}
    const next: Record<string, Group> = { ...groups }
    for (const [gid, g] of Object.entries(groups)) {
      if (!g.parcelIds.some((pid) => selected.has(pid))) continue
      originalAffectedGroups[gid] = { ...g, parcelIds: [...g.parcelIds] }
      const remaining = g.parcelIds.filter((pid) => !selected.has(pid))
      if (remaining.length === 0) delete next[gid]
      else next[gid] = { ...g, parcelIds: remaining }
    }
    next[groupId] = {
      name: null,
      memo: null,
      color: null,
      style: 'fill',
      parcelIds: [...parcelIds],
    }
    set({ groups: next, pendingGroupCreate: { groupId, originalAffectedGroups } })
    // 멀티선택 자동 종료 + 신규 그룹 시트 자동 열림 (v1 createGroupFromSelection 말미 보존)
    useUiStore.setState({
      multiSelectMode: false,
      multiSelectedIds: [],
      selectedGroupId: groupId,
      selectedParcelId: null,
      openSheet: 'group',
    })
  },

  commitGroupDraft: (draft) => {
    const { activeTabId, pendingGroupCreate, groups } = get()
    if (pendingGroupCreate === null) return
    if (activeTabId === null) {
      console.error('[workspace] commitGroupDraft: 부팅 전 호출 무시')
      return
    }
    const { groupId, originalAffectedGroups } = pendingGroupCreate
    for (const gid of Object.keys(originalAffectedGroups)) {
      api.tabState
        .upsertGroup(activeTabId, { groupId: gid, group: groups[gid] ?? null })
        .catch((err: unknown) => {
          console.error('[workspace] 그룹 저장 실패:', err)
        })
    }
    const parcelIds = groups[groupId]?.parcelIds ?? []
    set({ pendingGroupCreate: null })
    get().upsertGroup(groupId, { ...draft, parcelIds })
  },

  cancelGroupDraft: () => {
    const { pendingGroupCreate, groups } = get()
    if (pendingGroupCreate === null) return
    const next = { ...groups }
    delete next[pendingGroupCreate.groupId]
    for (const [gid, g] of Object.entries(pendingGroupCreate.originalAffectedGroups)) {
      next[gid] = g
    }
    set({ groups: next, pendingGroupCreate: null })
  },

  updateDraftGroupMembers: (parcelIds) => {
    const { pendingGroupCreate, groups } = get()
    if (pendingGroupCreate === null) return
    const cur = groups[pendingGroupCreate.groupId]
    if (cur === undefined) return
    set({ groups: { ...groups, [pendingGroupCreate.groupId]: { ...cur, parcelIds } } })
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
