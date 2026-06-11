// AC-3·4·8 순수 수식 검증 — 줌 중심 고정·클램프 (v1 MapView.jsx:586-697 보존)
import { describe, expect, it } from 'vitest'
import { dataToScreen, screenToData } from '../../../src/features/map/engine'
import {
  clampScale,
  panThreshold,
  pinchZoom,
  zoomAt,
  SCALE_MAX,
  SCALE_MIN,
  WHEEL_ZOOM_FACTOR,
} from '../../../src/features/map/gestureMath'

const ASPECT = 0.685

describe('panThreshold', () => {
  // 리터럴 고정 — 구현 상수 재참조는 v1 보존값(12/6px)을 보호하지 못한다
  it('터치/펜 12px, 마우스 6px', () => {
    expect(panThreshold('touch')).toBe(12)
    expect(panThreshold('pen')).toBe(12)
    expect(panThreshold('mouse')).toBe(6)
  })
})

describe('clampScale (AC-4)', () => {
  it('50..30000 범위로 클램프한다', () => {
    expect(clampScale(49.9)).toBe(50)
    expect(clampScale(50)).toBe(50)
    expect(clampScale(30000)).toBe(30000)
    expect(clampScale(30001)).toBe(30000)
  })
})

describe('zoomAt (AC-3·8)', () => {
  const start = { scale: 282, tx: 59, ty: 9 }

  it('scale을 정확히 factor배 하고 center 아래 데이터 좌표를 고정한다', () => {
    const center: [number, number] = [120, 80]
    const before = screenToData(start, ASPECT, center)
    const vp = zoomAt(start, ASPECT, center, WHEEL_ZOOM_FACTOR)
    expect(vp.scale).toBeCloseTo(282 * 1.15, 9)
    const after = screenToData(vp, ASPECT, center)
    expect(after[0]).toBeCloseTo(before[0], 6)
    expect(after[1]).toBeCloseTo(before[1], 6)
  })

  it('축소(÷factor)도 대칭으로 동작한다', () => {
    const vp = zoomAt(start, ASPECT, [200, 150], 1 / 1.6)
    expect(vp.scale).toBeCloseTo(282 / 1.6, 9)
  })

  it('클램프 경계에서는 scale·viewport가 더 변하지 않는다', () => {
    const atMax = { scale: SCALE_MAX, tx: -100, ty: -200 }
    const vp = zoomAt(atMax, ASPECT, [120, 80], 1.6)
    expect(vp.scale).toBe(SCALE_MAX)
    expect(vp.tx).toBeCloseTo(atMax.tx, 6)
    expect(vp.ty).toBeCloseTo(atMax.ty, 6)
  })

  it('반복 적용해도 50..30000을 벗어나지 않는다 (AC-4)', () => {
    let vp = { ...start }
    for (let i = 0; i < 60; i++) vp = zoomAt(vp, ASPECT, [120, 80], WHEEL_ZOOM_FACTOR)
    expect(vp.scale).toBe(SCALE_MAX)
    for (let i = 0; i < 100; i++) vp = zoomAt(vp, ASPECT, [120, 80], 1 / WHEEL_ZOOM_FACTOR)
    expect(vp.scale).toBe(SCALE_MIN)
  })
})

describe('pinchZoom (AC-5 수식)', () => {
  it('scale = 시작 scale × 거리비, 시작 중점의 데이터 좌표가 현재 중점으로 온다', () => {
    const start = { scale: 282, tx: 59, ty: 9 }
    const startCenter: [number, number] = [150, 150]
    const vp = pinchZoom(start, ASPECT, startCenter, 100, [200, 150], 200)
    expect(vp.scale).toBeCloseTo(282 * 2, 9)
    const anchored = dataToScreen(vp, ASPECT, screenToData(start, ASPECT, startCenter))
    expect(anchored[0]).toBeCloseTo(200, 6)
    expect(anchored[1]).toBeCloseTo(150, 6)
  })

  it('거리비가 커도 클램프를 지킨다', () => {
    const vp = pinchZoom({ scale: 20000, tx: 0, ty: 0 }, ASPECT, [100, 100], 50, [100, 100], 500)
    expect(vp.scale).toBe(SCALE_MAX)
  })
})
