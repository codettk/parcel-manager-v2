import type { Point } from '../../../utils/geo'
import type { Viewport } from './scene'

/** 모바일 고배율 백버퍼 메모리 보호 — v1 보존값 */
export const MAX_DPR = 2

/** 초기 fit 여백 비율 — v1 보존값 */
const FIT_RATIO = 0.94

/** 컨테이너에 aspect 유지 내접 × 0.94, 중앙 정렬 (v1·스파이크 동일) */
export function computeFitViewport(aspect: number, width: number, height: number): Viewport {
  const containerAspect = width / height
  let scale = containerAspect > aspect ? height : width / aspect
  scale *= FIT_RATIO
  return {
    scale,
    tx: (width - aspect * scale) / 2,
    ty: (height - scale) / 2,
  }
}

/** 데이터(0..1 정규화) → 화면(CSS px) — M-4 라벨 캔버스가 동일 변환을 사용한다 */
export function dataToScreen(viewport: Viewport, aspect: number, [x, y]: Point): Point {
  return [viewport.tx + x * aspect * viewport.scale, viewport.ty + y * viewport.scale]
}

/** 화면(CSS px) → 데이터(0..1 정규화) — M-3 제스처·M-7 히트테스트 경계 인터페이스 */
export function screenToData(viewport: Viewport, aspect: number, [sx, sy]: Point): Point {
  return [(sx - viewport.tx) / (aspect * viewport.scale), (sy - viewport.ty) / viewport.scale]
}
