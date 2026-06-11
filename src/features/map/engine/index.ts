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
export { hitTest } from './hitTest'
export {
  FILL_OPACITY,
  GROUP_DASH,
  LABEL_COLORS,
  MAP_COLORS,
  MAP_LINE_WIDTHS,
  SELECTED_FILL_OPACITY,
  hexA,
} from './colors'
export {
  LABEL_FONT,
  LABEL_FONT_SIZE,
  LABEL_LINE_HEIGHT,
  createLabelCaches,
  renderLabels,
  type LabelCaches,
  type LabelCanvas2D,
} from './labels'
export { createWrapTextCache, wrapText, type TextMeasurer, type WrapTextCache } from './wrapText'
export {
  createClustersCache,
  findClusters,
  type ClusterSource,
  type ClustersCache,
} from './clusters'
