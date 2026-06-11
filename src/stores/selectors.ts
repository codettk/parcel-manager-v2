// 메모이즈 셀렉터 — 동일 입력(참조) 동일 결과 참조 보장 (렌더 패스·useStore 스냅샷 입력 안정성).
// 스토어가 싱글턴이므로 단일 슬롯 캐시로 충분하다.
import type { SelectionState } from '../features/map/engine'
import type { ColorLabel } from '../types/api/colors'
import type { Group } from '../types/api/tabState'

let lastGroups: Record<string, Group> | null = null
let lastParcelToGroup: Record<string, string> = {}

/** groups → parcelId→groupId 역산 (v1 app.jsx parcelToGroup useMemo의 이전) */
export function selectParcelToGroup(state: {
  groups: Record<string, Group>
}): Record<string, string> {
  if (state.groups !== lastGroups) {
    const map: Record<string, string> = {}
    for (const [gid, g] of Object.entries(state.groups)) {
      for (const pid of g.parcelIds) map[pid] = gid
    }
    lastGroups = state.groups
    lastParcelToGroup = map
  }
  return lastParcelToGroup
}

let lastColorLabels: ColorLabel[] | null = null
let lastColorById: Record<string, string> = {}

/** colorLabels → colorId→hex (MapCanvas colorById prop 형태) */
export function selectColorById(state: { colorLabels: ColorLabel[] }): Record<string, string> {
  if (state.colorLabels !== lastColorLabels) {
    const map: Record<string, string> = {}
    for (const c of state.colorLabels) map[c.colorId] = c.hex
    lastColorLabels = state.colorLabels
    lastColorById = map
  }
  return lastColorById
}

let lastSelection: SelectionState | null = null

/** ui 선택 상태 5종 → 엔진 SelectionState 어댑터 */
export function selectSelection(state: SelectionState): SelectionState {
  const s = lastSelection
  if (
    s !== null &&
    s.selectedParcelId === state.selectedParcelId &&
    s.selectedGroupId === state.selectedGroupId &&
    s.multiSelectMode === state.multiSelectMode &&
    s.multiSelectedIds === state.multiSelectedIds &&
    s.addToGroupModeGroupId === state.addToGroupModeGroupId
  ) {
    return s
  }
  lastSelection = {
    selectedParcelId: state.selectedParcelId,
    selectedGroupId: state.selectedGroupId,
    multiSelectMode: state.multiSelectMode,
    multiSelectedIds: state.multiSelectedIds,
    addToGroupModeGroupId: state.addToGroupModeGroupId,
  }
  return lastSelection
}
