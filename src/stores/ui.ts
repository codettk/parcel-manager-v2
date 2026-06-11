import { create } from 'zustand'
import { EMPTY_SELECTION } from '../features/map/engine'
import { AREA_UNITS, type AreaUnitId } from '../utils/formatArea'

/** 열린 시트 식별자 — M-8+에서 'group' 등으로 확장 */
export type SheetId = 'parcel'

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
   * 지도 탭 → 단일 선택 + 필지 시트 열림을 원자적으로 설정 / null이면 해제 (M-7).
   * isInitializing 중에는 무시 (C-4 — 로드 중 상태와 어긋난 입력 방지).
   * 멀티선택·추가모드 분기는 M-8에서 이 액션을 확장한다.
   */
  tapParcel: (parcelId: string | null) => void
  /** 시트 닫기 — 선택도 함께 해제 (v1 onClose → setSelected(null) 보존). draft 폐기는 시트 로컬 소관 */
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
    if (parcelId === null) set({ selectedParcelId: null, openSheet: null })
    else set({ selectedParcelId: parcelId, openSheet: 'parcel' })
  },

  closeSheet: () => set({ openSheet: null, selectedParcelId: null }),

  areaUnit: loadAreaUnit(),
  setAreaUnit: (unit) => {
    localStorage.setItem(AREA_UNIT_STORAGE_KEY, unit)
    set({ areaUnit: unit })
  },

  setInitializing: (flag) => set({ isInitializing: flag }),

  realtimeStatus: 'disabled',
  setRealtimeStatus: (status) => set({ realtimeStatus: status }),
}))
