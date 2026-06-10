// v1 utils/geo.js 포팅 — 검증된 로직이므로 동작 보존 (명세서 §7.1 보존 판정, M-1)
export type Point = [number, number]

/** [minLng, minLat, maxLng, maxLat] */
export type Bbox = [number, number, number, number]

export interface Projector {
  aspect: number
  project(lng: number, lat: number): Point
}

/** WGS84 → 0..1 정규화 평면 투영 (중심 위도 보정 equirectangular) */
export function makeProjector(bbox: Bbox): Projector {
  const [minLng, minLat, maxLng, maxLat] = bbox
  const cLat = (minLat + maxLat) / 2
  const cosCLat = Math.cos((cLat * Math.PI) / 180)
  const w = (maxLng - minLng) * cosCLat
  const h = maxLat - minLat
  return {
    aspect: w / h,
    project(lng: number, lat: number): Point {
      return [((lng - minLng) * cosCLat) / w, 1 - (lat - minLat) / h]
    },
  }
}

/** Ray casting 히트테스트 */
export function pointInPolygon(x: number, y: number, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** 폴리곤 무게중심 — 면적이 0에 가까우면 정점 평균으로 폴백 */
export function polyCentroid(poly: Point[]): Point {
  let cx = 0
  let cy = 0
  let a = 0
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % n]
    const f = x0 * y1 - x1 * y0
    cx += (x0 + x1) * f
    cy += (y0 + y1) * f
    a += f
  }
  if (Math.abs(a) < 1e-12) {
    let sx = 0
    let sy = 0
    for (const [x, y] of poly) {
      sx += x
      sy += y
    }
    return [sx / poly.length, sy / poly.length]
  }
  a *= 0.5
  return [cx / (6 * a), cy / (6 * a)]
}

export function polyArea(poly: Point[]): number {
  let a = 0
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % n]
    a += x0 * y1 - x1 * y0
  }
  return Math.abs(a) * 0.5
}
