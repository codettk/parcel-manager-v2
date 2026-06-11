import { create } from 'zustand'
import { EMPTY_SELECTION } from '../features/map/engine'

/** 열린 시트 식별자 — 본 건은 자리만, 구체 유니온은 M-7+에서 확장 */
export type SheetId = never

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
   * 지도 탭 → 단일 선택 설정 / null이면 해제.
   * isInitializing 중에는 무시 (C-4 — 로드 중 상태와 어긋난 입력 방지).
   * 멀티선택·추가모드 분기는 M-8에서 이 액션을 확장한다.
   */
  tapParcel: (parcelId: string | null) => void
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
    set({ selectedParcelId: parcelId })
  },

  setInitializing: (flag) => set({ isInitializing: flag }),

  realtimeStatus: 'disabled',
  setRealtimeStatus: (status) => set({ realtimeStatus: status }),
}))
