import { z } from 'zod'
import { useUiStore, type RealtimeStatus } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import type { ColorLabel } from '../types/api/colors'
import type { Group, ParcelOverride } from '../types/api/tabState'
import type { Tab } from '../types/api/tabs'
import { isClearedOverride, normalizeOverride } from '../utils/override'
import { api, getClientId as defaultGetClientId } from './api'
import { getSupabaseClient } from './supabase'

// ── supabase-js 사용 부분집합 인터페이스 — 실제 클라이언트가 구조적으로 만족하고,
//    단위 테스트는 mock 채널로 payload를 흘릴 수 있다 (명세 §모듈 구조: 주입 가능 설계)

export interface PostgresChangesFilter {
  event: '*'
  schema: 'public'
  table: string
  filter?: string
}

/** Realtime postgres_changes payload의 모듈 내 표현 — 행 파싱은 내부 zod가 담당 */
export interface PostgresChangesPayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}

export interface RealtimeChannelLike {
  on(
    type: 'postgres_changes',
    filter: PostgresChangesFilter,
    callback: (payload: PostgresChangesPayload) => void,
  ): RealtimeChannelLike
  subscribe(callback?: (status: string) => void): RealtimeChannelLike
}

export interface RealtimeClientLike {
  channel(name: string): RealtimeChannelLike
  removeChannel(channel: RealtimeChannelLike): unknown
}

/** workspace 스토어의 사용 부분집합 — useWorkspaceStore가 구조적으로 만족 */
interface WorkspaceSlice {
  activeTabId: string | null
  overrides: Record<string, ParcelOverride>
  applyRemoteParcel(parcelId: string, override: ParcelOverride | null): void
  applyRemoteGroup(groupId: string, group: Group | null): void
  applyRemoteTabs(tabs: Tab[]): void
  applyRemoteColors(colorLabels: ColorLabel[]): void
  setActiveTab(tabId: string): Promise<void>
}

export interface WorkspaceStoreLike {
  getState(): WorkspaceSlice
  subscribe(listener: (state: WorkspaceSlice, prev: WorkspaceSlice) => void): () => void
}

export interface RealtimeSyncDeps {
  client: RealtimeClientLike
  getClientId?: () => string
  fetchTabs?: () => Promise<Tab[]>
  fetchColors?: () => Promise<ColorLabel[]>
  workspace?: WorkspaceStoreLike
  setStatus?: (status: RealtimeStatus) => void
}

export interface RealtimeSync {
  start(): void
  stop(): void
}

// ── 행 스키마 (snake_case — DB 표현, API 계약 아님. 파싱 실패 시 해당 이벤트 무시)

const parcelStyleRowSchema = z.enum(['fill', 'border'])

const settingsRowSchema = z.object({
  tab_id: z.string(),
  parcel_local_id: z.string(),
  color: z.string().nullable(),
  style: parcelStyleRowSchema.nullable(),
  name: z.string().nullable(),
  memo: z.string().nullable(),
  pinned: z.boolean().nullable(),
  icon: z.string().nullable(),
  updated_by: z.string().nullable(),
})

/** DELETE old는 replica identity(복합 PK)만 — updated_by 없음, 가드 없이 적용 (멱등이라 자기 에코 무해) */
const settingsOldRowSchema = z.object({
  tab_id: z.string(),
  parcel_local_id: z.string(),
})

const groupsRowSchema = z.object({
  group_id: z.string(),
  tab_id: z.string(),
  name: z.string().nullable(),
  memo: z.string().nullable(),
  color: z.string().nullable(),
  style: parcelStyleRowSchema.nullable(),
  parcel_ids: z.array(z.string()).nullable(),
  updated_by: z.string().nullable(),
})

const groupsOldRowSchema = z.object({ group_id: z.string() })

/**
 * tabs/colors는 목록 refetch만 하므로 에코 판정 필드만 본다.
 * updated_by 부재(nullish)는 비에코로 간주 — refetch는 멱등이라 과수신이 안전하다.
 */
const updatedByRowSchema = z.object({ updated_by: z.string().nullish() })

const CHANNELS = {
  settings: 'parcel_settings_changes',
  groups: 'parcel_groups_changes',
  tabs: 'tabs_changes',
  colors: 'color_labels_changes',
} as const

type ChannelKey = keyof typeof CHANNELS

const CHANNEL_COUNT = 4
const TAB_SCOPED_KEYS = ['settings', 'groups'] as const

function devError(...args: unknown[]): void {
  if (import.meta.env.DEV) console.error('[realtime]', ...args)
}

/** 순수 팩토리 — supabase 클라이언트·스토어·getClientId·refetch를 주입받는다 (React 미사용) */
export function createRealtimeSync(deps: RealtimeSyncDeps): RealtimeSync {
  const { client } = deps
  const resolveClientId = deps.getClientId ?? defaultGetClientId
  const fetchTabs = deps.fetchTabs ?? (() => api.tabs.list())
  const fetchColors = deps.fetchColors ?? (() => api.colors.list())
  const workspace: WorkspaceStoreLike = deps.workspace ?? useWorkspaceStore
  const setStatus =
    deps.setStatus ?? ((status: RealtimeStatus) => useUiStore.getState().setRealtimeStatus(status))

  const channels = new Map<ChannelKey, RealtimeChannelLike>()
  const channelStatus = new Map<ChannelKey, 'pending' | 'subscribed' | 'error'>()
  let unsubscribeWorkspace: (() => void) | null = null
  let started = false

  /** 상태 머신 집계: 임의 채널 error → error, 전 채널 subscribed → subscribed, 그 외 connecting */
  function reportStatus(): void {
    const statuses = [...channelStatus.values()]
    if (statuses.some((s) => s === 'error')) {
      setStatus('error')
    } else if (statuses.length === CHANNEL_COUNT && statuses.every((s) => s === 'subscribed')) {
      setStatus('subscribed')
    } else {
      setStatus('connecting')
    }
  }

  function openChannel(
    key: ChannelKey,
    table: string,
    filter: string | undefined,
    handler: (payload: PostgresChangesPayload) => void,
  ): void {
    const ch = client.channel(CHANNELS[key])
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, ...(filter !== undefined && { filter }) },
      handler,
    )
    channels.set(key, ch)
    channelStatus.set(key, 'pending')
    ch.subscribe((status) => {
      if (channels.get(key) !== ch) return // 제거된 채널의 늦은 콜백 무시
      if (status === 'SUBSCRIBED') channelStatus.set(key, 'subscribed')
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') channelStatus.set(key, 'error')
      else return // CLOSED 등은 집계 비대상
      reportStatus()
    })
  }

  function onSettingsChange(payload: PostgresChangesPayload): void {
    const state = workspace.getState()
    if (payload.eventType === 'DELETE') {
      const parsed = settingsOldRowSchema.safeParse(payload.old)
      if (!parsed.success) {
        devError('parcel_settings DELETE payload 파싱 실패:', parsed.error)
        return
      }
      // Realtime 필터는 DELETE에 적용되지 않는다 — 수신측 tab_id 검사로 탭 격리 보완 (명세 §채널 구성)
      if (parsed.data.tab_id !== state.activeTabId) return
      // v1 보존(app.jsx:597): pinned 필지는 원격 행 삭제로부터 보호
      if (state.overrides[parsed.data.parcel_local_id]?.pinned) return
      state.applyRemoteParcel(parsed.data.parcel_local_id, null)
      return
    }
    const parsed = settingsRowSchema.safeParse(payload.new)
    if (!parsed.success) {
      devError('parcel_settings payload 파싱 실패:', parsed.error)
      return
    }
    const row = parsed.data
    if (row.updated_by === resolveClientId()) return // 에코 가드
    if (row.tab_id !== state.activeTabId) return // 재구독 경합 잔여 이벤트 — 탭 격리
    const override = normalizeOverride({
      color: row.color,
      style: row.style,
      name: row.name,
      memo: row.memo,
      pinned: row.pinned ?? false,
      icon: row.icon,
    })
    state.applyRemoteParcel(row.parcel_local_id, isClearedOverride(override) ? null : override)
  }

  function onGroupsChange(payload: PostgresChangesPayload): void {
    const state = workspace.getState()
    if (payload.eventType === 'DELETE') {
      const parsed = groupsOldRowSchema.safeParse(payload.old)
      if (!parsed.success) {
        devError('parcel_groups DELETE payload 파싱 실패:', parsed.error)
        return
      }
      // group_id는 전역 유일 — 타 탭 그룹은 현재 상태에 키가 없어 자연 no-op (명세 §매핑)
      state.applyRemoteGroup(parsed.data.group_id, null)
      return
    }
    const parsed = groupsRowSchema.safeParse(payload.new)
    if (!parsed.success) {
      devError('parcel_groups payload 파싱 실패:', parsed.error)
      return
    }
    const row = parsed.data
    if (row.updated_by === resolveClientId()) return // 에코 가드
    if (row.tab_id !== state.activeTabId) return
    const group: Group = {
      name: row.name,
      memo: row.memo,
      color: row.color,
      style: row.style ?? 'fill',
      parcelIds: row.parcel_ids ?? [],
    }
    state.applyRemoteGroup(row.group_id, group)
  }

  async function refetchTabs(): Promise<void> {
    const tabs = await fetchTabs()
    workspace.getState().applyRemoteTabs(tabs)
    const { activeTabId } = workspace.getState()
    // 활성 탭이 다른 기기에서 닫힘 → 첫 탭 폴백 (C-1 의미론의 런타임 확장)
    if (tabs.length > 0 && !tabs.some((t) => t.tabId === activeTabId)) {
      await workspace.getState().setActiveTab(tabs[0].tabId)
    }
  }

  function isEchoListEvent(payload: PostgresChangesPayload): boolean {
    const row = payload.eventType === 'DELETE' ? payload.old : payload.new
    const parsed = updatedByRowSchema.safeParse(row)
    return parsed.success && parsed.data.updated_by === resolveClientId()
  }

  function onTabsChange(payload: PostgresChangesPayload): void {
    if (isEchoListEvent(payload)) return
    refetchTabs().catch((err: unknown) => devError('tabs refetch 실패:', err))
  }

  function onColorsChange(payload: PostgresChangesPayload): void {
    if (isEchoListEvent(payload)) return
    fetchColors()
      .then((colorLabels) => workspace.getState().applyRemoteColors(colorLabels))
      .catch((err: unknown) => devError('colors refetch 실패:', err))
  }

  function openTabScopedChannels(tabId: string): void {
    openChannel('settings', 'parcel_settings', `tab_id=eq.${tabId}`, onSettingsChange)
    openChannel('groups', 'parcel_groups', `tab_id=eq.${tabId}`, onGroupsChange)
  }

  /** supabase-js는 기존 채널의 필터 변경이 불가 — 탭 스코프 채널 2개만 제거 후 재생성 (명세 §탭 전환 재구독) */
  function resubscribeTabScopedChannels(tabId: string): void {
    for (const key of TAB_SCOPED_KEYS) {
      const ch = channels.get(key)
      if (ch !== undefined) {
        channels.delete(key)
        channelStatus.delete(key)
        client.removeChannel(ch)
      }
    }
    openTabScopedChannels(tabId)
    reportStatus()
  }

  function start(): void {
    if (started) return
    const { activeTabId } = workspace.getState()
    if (activeTabId === null) {
      devError('start: activeTabId 없음 — 부팅 완료 후 시작해야 한다')
      return
    }
    started = true
    openTabScopedChannels(activeTabId)
    openChannel('tabs', 'tabs', undefined, onTabsChange)
    openChannel('colors', 'color_labels', undefined, onColorsChange)
    reportStatus()
    unsubscribeWorkspace = workspace.subscribe((state, prev) => {
      if (state.activeTabId !== prev.activeTabId && state.activeTabId !== null) {
        resubscribeTabScopedChannels(state.activeTabId)
      }
    })
  }

  function stop(): void {
    if (unsubscribeWorkspace !== null) {
      unsubscribeWorkspace()
      unsubscribeWorkspace = null
    }
    for (const ch of channels.values()) client.removeChannel(ch)
    channels.clear()
    channelStatus.clear()
    started = false
    setStatus('disabled')
  }

  return { start, stop }
}

// await 이전에 promise를 고정해 동시 2회 호출에도 sync가 1개만 생성되게 한다
let activeInit: Promise<RealtimeSync | null> | null = null

/**
 * 편의 진입점 — boot() 성공 후 App 이펙트에서 1회 호출 (명세 §부팅 시퀀스).
 * 인증 세션과 동일한 Supabase 클라이언트(lib/supabase.ts)를 공유한다 — 세션 토큰이 구독에도 적용된다.
 * 키가 없으면(클라이언트 null) 시작하지 않고 disabled 유지 — E2E mockApi 환경의 정상 경로.
 */
export function initRealtime(): Promise<RealtimeSync | null> {
  activeInit ??= (async () => {
    const client = await getSupabaseClient()
    if (client === null) return null
    const sync = createRealtimeSync({ client })
    sync.start()
    return sync
  })()
  return activeInit
}
