import type { Point } from '../../../utils/geo'
import type { Group, ParcelOverride } from '../../../types/api/tabState'

/** 투영(0..1 정규화)·면적 계산이 끝난 필지 — 호스트의 데이터 준비 산출물 */
export interface EngineParcel {
  id: string
  jibun: string
  poly: Point[]
  area: number
}

/** 화면 변환: px = tx + x·(aspect·scale), py = ty + y·scale */
export interface Viewport {
  scale: number
  tx: number
  ty: number
}

export interface SelectionState {
  selectedParcelId: string | null
  selectedGroupId: string | null
  multiSelectMode: boolean
  multiSelectedIds: string[]
  addToGroupModeGroupId: string | null
}

export const EMPTY_SELECTION: SelectionState = {
  selectedParcelId: null,
  selectedGroupId: null,
  multiSelectMode: false,
  multiSelectedIds: [],
  addToGroupModeGroupId: null,
}

/**
 * 렌더 입력 전체. 라벨 캔버스(M-4)도 동일 씬을 입력으로 사용한다.
 * colorById: 팔레트 색 id → hex (color_labels = M-11 소관이라 주입 인터페이스만)
 */
export interface MapScene {
  /** makeProjector(bbox).aspect — 정규화 평면의 가로/세로 비 */
  aspect: number
  /** 면적 내림차순 정렬(작은 필지가 위) — 정렬은 호스트 책임 */
  parcels: EngineParcel[]
  overrides: Record<string, ParcelOverride>
  groups: Record<string, Group>
  parcelToGroup: Record<string, string>
  colorById: Record<string, string>
  viewport: Viewport
  selection: SelectionState
}
