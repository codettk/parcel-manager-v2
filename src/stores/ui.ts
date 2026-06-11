import { create } from 'zustand'
import { EMPTY_SELECTION } from '../features/map/engine'
import { AREA_UNITS, type AreaUnitId } from '../utils/formatArea'
import { selectParcelToGroup } from './selectors'
import { useWorkspaceStore } from './workspace'

/** 열린 시트 식별자 */
export type SheetId = 'parcel' | 'group'

export const AREA_UNIT_STORAGE_KEY = 'bogugot_v2_area_unit'

/** localStorage에 영속된 면적 단위 복원 — 알 수 없는 값이면 ㎡ 폴백 */
function loadAreaUnit(): AreaUnitId {
  const stored = localStorage.getItem(AREA_UNIT_STORAGE_KEY)
  return AREA_UNITS.find((u) => u.id === stored)?.id ?? 'm2'
}

/** Realtime 연결 상태 (M-6) — disabled는 supabase 키 미설정 환경(E2E mockApi 등)을 error와 구분한다 */
export type RealtimeStatus = 'disabled' | 'connecting' | 'subscribed' | 'error'

export interface UiState {
  /** 부팅·탭 전환 로드 중 true — 입력 차단 (C-4). workspace.boot/setActiveTab이 토글한다 */
  isInitializing: boolean
  openSheet: SheetId | null
  selectedParcelId: string | null
  selectedGroupId: string | null
  multiSelectMode: boolean
  multiSelectedIds: string[]
  addToGroupModeGroupId: string | null
  /**
   * 지도 탭 분기 (M-8 확장, v1 handleSelect 보존):
   * - 멀티선택 모드: 비그룹 필지 개별 토글, 그룹 소속 필지는 그룹 멤버 전체 토글, 빈 곳 무시
   * - 추가모드: 해당 그룹 멤버 토글을 탭마다 즉시 upsertGroup, 타 그룹 소속·빈 곳 무시
   * - 일반: 그룹 멤버 → 그룹 선택 + 그룹 시트, 비소속 → 필지 시트, 빈 곳 → 해제
   * isInitializing 중에는 무시 (C-4 — 로드 중 상태와 어긋난 입력 방지).
   */
  tapParcel: (parcelId: string | null) => void
  /** 멀티선택 모드 토글 — 진입·재탭 종료 모두 선택을 비운다 (v1 보존) */
  toggleMultiSelectMode: () => void
  /** 그룹 시트 "필지 추가" — 시트를 닫고 추가모드 진입 (7차 패스 입력) */
  enterAddToGroupMode: (groupId: string) => void
  /** 추가모드 완료 — 모드 해제 + 해당 그룹 시트 복귀 */
  finishAddToGroupMode: () => void
  /**
   * 시트 닫기 — 선택도 함께 해제 (v1 onClose → setSelected(null) 보존). draft 폐기는 시트 로컬 소관.
   * 그룹 생성 pending 중의 닫기(X·backdrop)는 cancelGroupDraft 원복과 동일 의미 (명세 ②)
   */
  closeSheet: () => void
  /** 면적 표시 단위 — draft가 아닌 즉시 전역 반영, localStorage 영속 (M-7) */
  areaUnit: AreaUnitId
  setAreaUnit: (unit: AreaUnitId) => void
  setInitializing: (flag: boolean) => void
  /** Realtime 연결 상태 — lib/realtime.ts가 쓰고, 소비자(M-7+ 시트, M-16 탭)는 읽기만 한다 */
  realtimeStatus: RealtimeStatus
  setRealtimeStatus: (status: RealtimeStatus) => void
}

export const useUiStore = create<UiState>()((set, get) => ({
  isInitializing: true,
  openSheet: null,
  ...EMPTY_SELECTION,

  tapParcel: (parcelId) => {
    if (get().isInitializing) return
    const ws = useWorkspaceStore.getState()
    const parcelToGroup = selectParcelToGroup(ws)

    if (get().multiSelectMode) {
      if (parcelId === null) return
      const selected = get().multiSelectedIds
      const gid = parcelToGroup[parcelId]
      if (gid !== undefined) {
        // 그룹 소속 필지 탭 = 그룹 멤버 전체 토글 (전원 선택 상태면 전체 해제)
        const members = ws.groups[gid]?.parcelIds ?? []
        const allSelected = members.every((id) => selected.includes(id))
        set({
          multiSelectedIds: allSelected
            ? selected.filter((id) => !members.includes(id))
            : [...new Set([...selected, ...members])],
        })
      } else {
        set({
          multiSelectedIds: selected.includes(parcelId)
            ? selected.filter((id) => id !== parcelId)
            : [...selected, parcelId],
        })
      }
      return
    }

    const addGid = get().addToGroupModeGroupId
    if (addGid !== null) {
      if (parcelId === null) return
      const cur = ws.groups[addGid]
      if (cur === undefined) return
      const owner = parcelToGroup[parcelId]
      if (owner !== undefined && owner !== addGid) return // 타 그룹 소속 무시 — 서버 호출 없음
      const parcelIds = cur.parcelIds.includes(parcelId)
        ? cur.parcelIds.filter((id) => id !== parcelId)
        : [...cur.parcelIds, parcelId]
      ws.upsertGroup(addGid, { ...cur, parcelIds }) // 탭마다 즉시 전송 (드래프트 아님 — v1 보존)
      return
    }

    // 일반 분기 — pending 드래프트에서 다른 대상으로 이동하면 먼저 원복 (닫기와 동일 의미)
    if (ws.pendingGroupCreate !== null) {
      const staysOnPending =
        parcelId !== null && parcelToGroup[parcelId] === ws.pendingGroupCreate.groupId
      if (!staysOnPending) ws.cancelGroupDraft()
    }
    if (parcelId === null) {
      set({ selectedParcelId: null, selectedGroupId: null, openSheet: null })
      return
    }
    // cancelGroupDraft가 그룹 구성을 원복했을 수 있어 소속을 재산출한다
    const gid = selectParcelToGroup(useWorkspaceStore.getState())[parcelId]
    if (gid !== undefined) set({ selectedGroupId: gid, selectedParcelId: null, openSheet: 'group' })
    else set({ selectedParcelId: parcelId, selectedGroupId: null, openSheet: 'parcel' })
  },

  toggleMultiSelectMode: () => {
    if (get().isInitializing) return
    set((s) => ({ multiSelectMode: !s.multiSelectMode, multiSelectedIds: [] }))
  },

  enterAddToGroupMode: (groupId) =>
    set({
      addToGroupModeGroupId: groupId,
      openSheet: null,
      selectedParcelId: null,
      selectedGroupId: null,
    }),

  finishAddToGroupMode: () => {
    const gid = get().addToGroupModeGroupId
    if (gid === null) return
    set({
      addToGroupModeGroupId: null,
      selectedGroupId: gid,
      selectedParcelId: null,
      openSheet: 'group',
    })
  },

  closeSheet: () => {
    const ws = useWorkspaceStore.getState()
    if (ws.pendingGroupCreate !== null) ws.cancelGroupDraft()
    set({ openSheet: null, selectedParcelId: null, selectedGroupId: null })
  },

  areaUnit: loadAreaUnit(),
  setAreaUnit: (unit) => {
    localStorage.setItem(AREA_UNIT_STORAGE_KEY, unit)
    set({ areaUnit: unit })
  },

  setInitializing: (flag) => set({ isInitializing: flag }),

  realtimeStatus: 'disabled',
  setRealtimeStatus: (status) => set({ realtimeStatus: status }),
}))
