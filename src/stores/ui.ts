import { create } from 'zustand'
import { EMPTY_SELECTION } from '../features/map/engine'
import { ALL_JIMOK, type JimokKey } from '../features/map/jimok'
import { getRegionById } from '../features/region/regionCatalog'
import { AREA_UNITS, type AreaUnitId } from '../utils/formatArea'
import { selectParcelToGroup } from './selectors'
import { useWorkspaceStore } from './workspace'

/** 열린 시트 식별자 */
export type SheetId = 'parcel' | 'group' | 'calcResult'

export const AREA_UNIT_STORAGE_KEY = 'bogugot_v2_area_unit'

/** localStorage에 영속된 면적 단위 복원 — 알 수 없는 값이면 ㎡ 폴백 */
function loadAreaUnit(): AreaUnitId {
  const stored = localStorage.getItem(AREA_UNIT_STORAGE_KEY)
  return AREA_UNITS.find((u) => u.id === stored)?.id ?? 'm2'
}

/** 마지막 선택 region 영속 키 — 새로고침 시 게이트를 건너뛰고 직행 (AC-10) */
export const ACTIVE_REGION_STORAGE_KEY = 'pilji_v2_active_region'

/**
 * 영속된 마지막 region 복원 — 카탈로그에 없거나(폐기된 id) 미적재 region이면 null(게이트 표시).
 * 미적재 region은 지도 데이터가 없어 진입 자체가 불가하므로 영속 값으로도 인정하지 않는다.
 * AC-10 새로고침 직행의 핵심 분기라 단위 테스트 대상으로 export 한다.
 */
export function loadActiveRegion(): string | null {
  const stored = localStorage.getItem(ACTIVE_REGION_STORAGE_KEY)
  if (stored === null) return null
  return getRegionById(stored)?.loaded === true ? stored : null
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
   * - 계산기 모드: 그룹 분기 우회 — 필지(그룹 소속 포함) → 결과 시트, 빈 곳 → 결과만 닫고 모드 유지
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
  /**
   * 필지 목록 전체 화면 뷰 (M-9) — 시트와 독립 레이어.
   * 시트가 목록 위에 열려도 listViewOpen은 유지된다 (v1 이슈 #5 수정본 보존).
   * 진입 시 멀티선택·추가모드를 해제한다 — 모드 오버레이(z-10)가 목록(z-20) 아래
   * 가려진 채 행 탭이 무음 데이터 변경을 일으키는 상태 차단 (검증 반려 B-1)
   */
  listViewOpen: boolean
  openListView: () => void
  closeListView: () => void
  /**
   * 목록 행 탭 (M-9, B-1 정정) — 멀티선택·추가모드 분기를 타지 않고 시트 분기 직행
   * (그룹 소속 → 그룹 시트, 비소속 → 필지 시트. v1 onSelectParcel 동형).
   * pending 그룹 드래프트 중 다른 대상 탭 = 드래프트 원복 후 새 대상 (tapParcel과 동일).
   * 계산기 모드 중에는 모드 우선 — 일반 시트 대신 결과 시트 직행 (명세 미정 케이스의 구현 결정:
   * 모드 배지가 떠 있는 채 편집 시트가 열리는 혼선 차단. tapParcel 계산기 분기와 동일 의미)
   */
  openParcelFromList: (parcelId: string) => void
  /**
   * 계산기 모드 (M-10) — true면 tapParcel이 멀티선택·추가모드·그룹 분기를 모두 우회하고
   * 그룹 소속 필지도 개별 필지로 취급해 결과 시트로 직행한다 (v1 app.jsx:244 'calculator_active' 가드 보존)
   */
  calculatorActive: boolean
  /** 진입(설정 시트 "계산 시작") — 모드 충돌 차단: 멀티선택·추가모드 해제 + pending 드래프트 원복 + 시트·선택 해제 */
  enterCalculatorMode: () => void
  /** 종료(모드 배지 "종료") — 모드 해제 + 선택·결과 시트 해제 */
  exitCalculatorMode: () => void
  /**
   * 팔레트 설정 시트 열림 (M-11) — 다른 시트와 독립 오버레이.
   * 열림 상태만 전역(E2E·진입점 공유) — draft·deletedIds는 시트 로컬 소관 (CONVENTIONS §3)
   */
  paletteOpen: boolean
  openPalette: () => void
  closePalette: () => void
  /**
   * 공유 시트 열림 (M-12) — 팔레트(M-11) 선례: 열림만 전역,
   * 파일 선택·미리보기·오류는 시트 로컬 소관 (CONVENTIONS §3)
   */
  shareOpen: boolean
  openShare: () => void
  closeShare: () => void
  /**
   * 초기화 시트 열림 (M-15) — 팔레트(M-11)·공유(M-12) 선례: 열림만 전역,
   * 선택 항목 draft는 시트 로컬 소관 (CONVENTIONS §3)
   */
  resetSheetOpen: boolean
  openReset: () => void
  closeReset: () => void
  /**
   * 앱 메뉴 드로어 열림 (M-16) — 팔레트(M-11)·공유(M-12) 선례: 열림만 전역.
   * 드로어 항목이 시트/뷰를 열 때는 드로어를 닫는다 (App에서 조립)
   */
  navDrawerOpen: boolean
  openNavDrawer: () => void
  closeNavDrawer: () => void
  /**
   * 히스토리 시트 열림 (M-16) — 닫힌 탭 목록. 열림만 전역,
   * 행별 인라인 편집·삭제 확인은 시트 로컬 소관 (CONVENTIONS §3)
   */
  historyOpen: boolean
  openHistory: () => void
  closeHistory: () => void
  /**
   * 지목 필터 (M-14) — 초기 6종 전체. 세션 한정(영속 아님, v1 동일).
   * 적용은 지도 렌더+히트테스트 한정 (목록 뷰는 비적용 — v1 view!=='list' 보존).
   */
  jimokFilter: JimokKey[]
  /** 필터 전체 교체 ('전체' 칩 토글) — 변경 시 선택·시트 해제 (v1 useEffect 보존) */
  setJimokFilter: (next: JimokKey[]) => void
  /** 개별 지목 토글 — 변경 시 선택·시트 해제 (v1 useEffect 보존) */
  toggleJimok: (key: JimokKey) => void
  /** 면적 표시 단위 — draft가 아닌 즉시 전역 반영, localStorage 영속 (M-7) */
  areaUnit: AreaUnitId
  setAreaUnit: (unit: AreaUnitId) => void
  setInitializing: (flag: boolean) => void
  /** Realtime 연결 상태 — lib/realtime.ts가 쓰고, 소비자(M-7+ 시트, M-16 탭)는 읽기만 한다 */
  realtimeStatus: RealtimeStatus
  setRealtimeStatus: (status: RealtimeStatus) => void
  /**
   * 현재 진입한 region id (전국 지적도 진입 게이트). null이면 지역 선택 화면을 띄운다 (AC-4).
   * 적재 region만 유효 — localStorage(ACTIVE_REGION_STORAGE_KEY) 영속으로 새로고침 직행 (AC-10).
   */
  activeRegionId: string | null
  /** 지역 선택 화면 강제 표시 — region 진입 후에도 칩 탭으로 재진입 (AC-9) */
  regionSelectOpen: boolean
  /**
   * region 선택 — 적재 region만 진입을 허용한다. 미적재면 무시(false 반환) — 호출부가
   * "준비 중" 안내를 띄운다 (AC-6). 성공 시 localStorage 영속 + 선택 화면 닫기 (AC-5·10).
   */
  selectRegion: (regionId: string) => boolean
  /** 칩/메뉴에서 지역 선택 화면 열기 (AC-8·9) */
  openRegionSelect: () => void
  closeRegionSelect: () => void
  /**
   * 지역 관리 화면 열림 (AC-11) — 받은(적재) region 열람·전환. 다른 시트 선례: 열림만 전역.
   * 선택 화면(regionSelectOpen)과 독립 — 둘 다 region 풀스크린 뷰 레이어다.
   */
  regionManageOpen: boolean
  openRegionManage: () => void
  closeRegionManage: () => void
}

/**
 * 시트 분기 공통 로직 (tapParcel 일반 분기 = 목록 행 탭 openParcelFromList) —
 * pending 드래프트에서 다른 대상으로 이동하면 먼저 원복 (닫기와 동일 의미)
 */
function openSheetForParcel(parcelId: string) {
  const ws = useWorkspaceStore.getState()
  if (ws.pendingGroupCreate !== null) {
    const staysOnPending = selectParcelToGroup(ws)[parcelId] === ws.pendingGroupCreate.groupId
    if (!staysOnPending) ws.cancelGroupDraft()
  }
  // cancelGroupDraft가 그룹 구성을 원복했을 수 있어 소속을 재산출한다
  const gid = selectParcelToGroup(useWorkspaceStore.getState())[parcelId]
  if (gid !== undefined) {
    useUiStore.setState({ selectedGroupId: gid, selectedParcelId: null, openSheet: 'group' })
  } else {
    useUiStore.setState({ selectedParcelId: parcelId, selectedGroupId: null, openSheet: 'parcel' })
  }
}

export const useUiStore = create<UiState>()((set, get) => ({
  isInitializing: true,
  openSheet: null,
  ...EMPTY_SELECTION,

  tapParcel: (parcelId) => {
    if (get().isInitializing) return

    if (get().calculatorActive) {
      // 그룹 소속이어도 개별 필지로 취급 — 그룹 시트 분기 비경유 (v1 app.jsx:244 가드 보존)
      if (parcelId === null) {
        set({ selectedParcelId: null, selectedGroupId: null, openSheet: null }) // 모드는 유지
        return
      }
      set({ selectedParcelId: parcelId, selectedGroupId: null, openSheet: 'calcResult' })
      return
    }

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

    // 일반 분기 — 빈 곳 탭은 드래프트 원복 + 선택·시트 해제
    if (parcelId === null) {
      if (ws.pendingGroupCreate !== null) ws.cancelGroupDraft()
      set({ selectedParcelId: null, selectedGroupId: null, openSheet: null })
      return
    }
    openSheetForParcel(parcelId)
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

  listViewOpen: false,
  // 추가모드 해제는 finishAddToGroupMode(그룹 시트 복귀)가 아닌 단순 해제 —
  // 복귀 시트가 목록 아래 깔려 보이지 않으므로 (B-1 설계 결정)
  openListView: () =>
    set({
      listViewOpen: true,
      multiSelectMode: false,
      multiSelectedIds: [],
      addToGroupModeGroupId: null,
    }),
  closeListView: () => set({ listViewOpen: false }),

  openParcelFromList: (parcelId) => {
    if (get().isInitializing) return
    if (get().calculatorActive) {
      set({ selectedParcelId: parcelId, selectedGroupId: null, openSheet: 'calcResult' })
      return
    }
    openSheetForParcel(parcelId)
  },

  calculatorActive: false,

  enterCalculatorMode: () => {
    const ws = useWorkspaceStore.getState()
    if (ws.pendingGroupCreate !== null) ws.cancelGroupDraft()
    set({
      calculatorActive: true,
      multiSelectMode: false,
      multiSelectedIds: [],
      addToGroupModeGroupId: null,
      openSheet: null,
      selectedParcelId: null,
      selectedGroupId: null,
    })
  },

  exitCalculatorMode: () =>
    set({
      calculatorActive: false,
      openSheet: null,
      selectedParcelId: null,
      selectedGroupId: null,
    }),

  paletteOpen: false,
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),

  shareOpen: false,
  openShare: () => set({ shareOpen: true }),
  closeShare: () => set({ shareOpen: false }),

  resetSheetOpen: false,
  openReset: () => set({ resetSheetOpen: true }),
  closeReset: () => set({ resetSheetOpen: false }),

  navDrawerOpen: false,
  openNavDrawer: () => set({ navDrawerOpen: true }),
  closeNavDrawer: () => set({ navDrawerOpen: false }),

  historyOpen: false,
  openHistory: () => set({ historyOpen: true }),
  closeHistory: () => set({ historyOpen: false }),

  jimokFilter: [...ALL_JIMOK],
  // 필터 변경은 현재 선택·시트만 해제한다 (v1 app.jsx:687 useEffect 보존).
  // 모드(멀티선택·추가·계산기)는 v1에 연관 동작이 없어 건드리지 않는다 (최소 변경).
  setJimokFilter: (next) =>
    set({ jimokFilter: next, selectedParcelId: null, selectedGroupId: null, openSheet: null }),
  toggleJimok: (key) =>
    set((s) => {
      const next = s.jimokFilter.includes(key)
        ? s.jimokFilter.filter((k) => k !== key)
        : [...s.jimokFilter, key]
      return { jimokFilter: next, selectedParcelId: null, selectedGroupId: null, openSheet: null }
    }),

  areaUnit: loadAreaUnit(),
  setAreaUnit: (unit) => {
    localStorage.setItem(AREA_UNIT_STORAGE_KEY, unit)
    set({ areaUnit: unit })
  },

  setInitializing: (flag) => set({ isInitializing: flag }),

  realtimeStatus: 'disabled',
  setRealtimeStatus: (status) => set({ realtimeStatus: status }),

  activeRegionId: loadActiveRegion(),
  regionSelectOpen: false,

  selectRegion: (regionId) => {
    const region = getRegionById(regionId)
    if (region === undefined || !region.loaded) return false // 미적재 — 지도 미전환 (AC-6)
    localStorage.setItem(ACTIVE_REGION_STORAGE_KEY, regionId)
    set({ activeRegionId: regionId, regionSelectOpen: false, regionManageOpen: false })
    return true
  },

  openRegionSelect: () => set({ regionSelectOpen: true }),
  closeRegionSelect: () => set({ regionSelectOpen: false }),

  regionManageOpen: false,
  openRegionManage: () => set({ regionManageOpen: true }),
  closeRegionManage: () => set({ regionManageOpen: false }),
}))
