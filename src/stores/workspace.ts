import { create } from 'zustand'
import { genGroupId } from '../features/group/groupId'
import { mergeColors } from '../features/share/shareFile'
import { api } from '../lib/api'
import type { CalcRecipe } from '../types/api/calcRecipes'
import type { ColorLabel } from '../types/api/colors'
import type { Group, ParcelOverride, ResetItem } from '../types/api/tabState'
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
  /**
   * 계산 레시피 (M-10) — 전 탭 공유 설정 (colorLabels 선례), 서버 단일 소스.
   * Realtime 채널 없음 — 설정 시트가 열릴 때마다 loadCalcRecipes로 최신화한다 (v1 보존)
   */
  calcRecipes: CalcRecipe[]
  /** GET /api/calc-recipes — null(미설정)은 빈 배열로 정규화. 실패는 reject (호출부 폴백 소관) */
  loadCalcRecipes: () => Promise<void>
  /** 낙관적 저장 — 동기 갱신 후 PUT 전송. 실패 시 롤백 없음(upsertParcel 동형), console.error 보고 */
  saveCalcRecipes: (recipes: CalcRecipe[]) => void
  /**
   * 팔레트 일괄 저장 (M-11, M-5에서 이연된 colorLabels mutate) — 행 순서를 sortOrder로
   * 명시 부여해 PUT (GET이 sort_order 정렬이므로 왕복 보존). 낙관적 — 실패 시 롤백 없음(upsertParcel 동형)
   */
  saveColors: (colors: ColorLabel[]) => void
  /**
   * 색 삭제 (M-11) — DELETE + 현재 탭 낙관적 로컬 정리(override의 color·style 비움, groups color null).
   * 참조 정리의 권위는 서버(전 탭 null 처리)지만 자기 mutate는 Realtime 에코 가드로 무시되므로 로컬 정리 필수
   */
  deleteColorAndCleanup: (colorId: string) => void
  /**
   * 선택 초기화 (M-15) — pinned 보호 낙관적 로컬 정리(deleteColorAndCleanup 선례) + reset API 1회.
   * 비고정 필지에서 items 의미필드 제거(color는 style 동반), normalizeOverride/isClearedOverride로
   * 빈 행 청소. items에 group 포함 시 groups={} 전체 해체(pinned override는 보존).
   * 서버 핸들러(tabResetHandler)와 동형 — 자기 mutate는 Realtime 에코 가드로 무시되므로 로컬 정리가 권위.
   * 실패 시 롤백 없음(upsertParcel 동형).
   */
  reset: (items: ResetItem[]) => void
  /**
   * JSON 불러오기 적용 (M-12) — 순차 3단계: ① importState(현재 탭 settings/groups 전체 교체)
   * ② colors가 1개 이상이면 기존 colorLabels에 upsert 병합 후 PUT(전 탭 공유 자원이라 교체 금지)
   * ③ 서버 재조회로 로컬 갱신 — 서버가 group_id를 전부 재생성하므로 파일의 groupId를
   * 로컬에 직접 쓰면 키가 어긋난다. refetch가 유일하게 올바른 경로 (명세 §적용).
   * 실패는 reject — 호출부(공유 시트)가 인라인 표면화 (v1 fire-and-forget 폐기)
   */
  importFromFile: (file: {
    overrides: Record<string, ParcelOverride>
    groups: Record<string, Group>
    colors: ColorLabel[]
  }) => Promise<void>
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

  calcRecipes: [],

  loadCalcRecipes: async () => {
    const { recipes } = await api.calcRecipes.get()
    set({ calcRecipes: recipes ?? [] })
  },

  saveCalcRecipes: (recipes) => {
    set({ calcRecipes: recipes })
    api.calcRecipes.put({ recipes }).catch((err: unknown) => {
      console.error('[workspace] 계산 레시피 저장 실패:', err)
    })
  },

  saveColors: (colors) => {
    const ordered = colors.map((c, i) => ({ ...c, sortOrder: i }))
    set({ colorLabels: ordered })
    api.colors.put({ colors: ordered }).catch((err: unknown) => {
      console.error('[workspace] 팔레트 저장 실패:', err)
    })
  },

  deleteColorAndCleanup: (colorId) => {
    const { colorLabels, overrides, groups } = get()
    const nextOverrides = { ...overrides }
    for (const [pid, o] of Object.entries(overrides)) {
      if (o.color !== colorId) continue
      // 서버 핸들러와 동형 정규화 — 남는 의미 필드가 없으면 키 삭제 (name 등이 있으면 보존)
      const cleared = normalizeOverride({ ...o, color: null, style: null })
      if (isClearedOverride(cleared)) delete nextOverrides[pid]
      else nextOverrides[pid] = cleared
    }
    const nextGroups = { ...groups }
    for (const [gid, g] of Object.entries(groups)) {
      if (g.color === colorId) nextGroups[gid] = { ...g, color: null }
    }
    set({
      colorLabels: colorLabels.filter((c) => c.colorId !== colorId),
      overrides: nextOverrides,
      groups: nextGroups,
    })
    api.colors.remove(colorId).catch((err: unknown) => {
      console.error('[workspace] 색 삭제 실패:', err)
    })
  },

  reset: (items) => {
    const { activeTabId, overrides, groups } = get()
    if (activeTabId === null) {
      console.error('[workspace] reset: 부팅 전 호출 무시')
      return
    }
    if (items.length === 0) return

    const clearColor = items.includes('color')
    const clearName = items.includes('name')
    const clearMemo = items.includes('memo')
    const clearGroup = items.includes('group')

    const nextOverrides = { ...overrides }
    for (const [pid, o] of Object.entries(overrides)) {
      if (o.pinned) continue // 고정 필지 보호 (서버 .not('pinned','is',true)와 동형)
      // 서버 핸들러와 동형 정규화 — color 초기화는 style도 함께 비운다 (buildResetPatch 보존)
      const cleared = normalizeOverride({
        ...o,
        color: clearColor ? null : o.color,
        style: clearColor ? null : o.style,
        name: clearName ? null : o.name,
        memo: clearMemo ? null : o.memo,
      })
      if (isClearedOverride(cleared)) delete nextOverrides[pid]
      else nextOverrides[pid] = cleared
    }

    set({ overrides: nextOverrides, groups: clearGroup ? {} : groups })
    api.tabState.reset(activeTabId, { items }).catch((err: unknown) => {
      console.error('[workspace] 초기화 실패:', err)
    })
  },

  importFromFile: async (file) => {
    const { activeTabId } = get()
    if (activeTabId === null) throw new Error('부팅이 끝나기 전에는 불러올 수 없습니다.')
    await api.tabState.importState(activeTabId, {
      overrides: file.overrides,
      groups: file.groups,
    })
    if (file.colors.length > 0) {
      await api.colors.put({ colors: mergeColors(get().colorLabels, file.colors) })
    }
    const [state, colorLabels] = await Promise.all([
      api.tabState.get(activeTabId),
      api.colors.list(),
    ])
    set({ overrides: state.overrides, groups: state.groups, colorLabels })
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
