// 제스처 순수 계산 — 보존값·수식의 단일 출처 (v1 MapView.jsx:586-697)
import type { Point } from '../../utils/geo'
import { screenToData, type Viewport } from './engine'

export const SCALE_MIN = 50
export const SCALE_MAX = 30000
export const WHEEL_ZOOM_FACTOR = 1.15
export const BUTTON_ZOOM_FACTOR = 1.6
export const TAP_MAX_MS = 500
export const PAN_THRESHOLD_TOUCH_PX = 12
export const PAN_THRESHOLD_MOUSE_PX = 6

/** 팬 시작 임계값 — 터치/펜 12px, 마우스 6px (v1:615) */
export function panThreshold(pointerType: string): number {
  return pointerType === 'mouse' ? PAN_THRESHOLD_MOUSE_PX : PAN_THRESHOLD_TOUCH_PX
}

export function clampScale(scale: number): number {
  return Math.max(SCALE_MIN, Math.min(scale, SCALE_MAX))
}

/** anchor(시작 viewport 기준 화면점) 아래 데이터 좌표가 target 화면점에 오도록 산출 */
function anchoredZoom(
  start: Viewport,
  aspect: number,
  anchor: Point,
  target: Point,
  newScale: number,
): Viewport {
  const [dataX, dataY] = screenToData(start, aspect, anchor)
  return {
    scale: newScale,
    tx: target[0] - dataX * aspect * newScale,
    ty: target[1] - dataY * newScale,
  }
}

/** 휠/버튼 줌 — center 아래 데이터 좌표 고정 ×factor, 클램프 50..30000 */
export function zoomAt(start: Viewport, aspect: number, center: Point, factor: number): Viewport {
  return anchoredZoom(start, aspect, center, center, clampScale(start.scale * factor))
}

/** 핀치 — scale = 시작 scale × 거리비, 시작 중점의 데이터 좌표를 현재 중점에 고정 */
export function pinchZoom(
  start: Viewport,
  aspect: number,
  startCenter: Point,
  startDist: number,
  center: Point,
  dist: number,
): Viewport {
  return anchoredZoom(
    start,
    aspect,
    startCenter,
    center,
    clampScale(start.scale * (dist / startDist)),
  )
}
