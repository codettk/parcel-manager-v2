// 엔진 공개 경계 — M-3(제스처)·M-4(라벨)·M-7(히트테스트)은 이 export만 사용한다
export {
  EMPTY_SELECTION,
  type EngineParcel,
  type MapScene,
  type SelectionState,
  type Viewport,
} from './scene'
export { renderScene, type Canvas2D, type RenderSize } from './renderScene'
export {
  computeOuterEdges,
  createOuterEdgesCache,
  type Edge,
  type OuterEdgesCache,
} from './outerEdges'
export { MAX_DPR, computeFitViewport, dataToScreen, screenToData } from './viewport'
export {
  FILL_OPACITY,
  GROUP_DASH,
  MAP_COLORS,
  MAP_LINE_WIDTHS,
  SELECTED_FILL_OPACITY,
  hexA,
} from './colors'
