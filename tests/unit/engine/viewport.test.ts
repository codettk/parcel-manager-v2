import { describe, expect, it } from 'vitest'
import { computeFitViewport, dataToScreen, screenToData } from '../../../src/features/map/engine'

describe('computeFitViewport', () => {
  it('가로가 넓은 컨테이너: 높이 기준 내접 × 0.94, 중앙 정렬', () => {
    const vp = computeFitViewport(0.5, 400, 200)
    expect(vp.scale).toBeCloseTo(200 * 0.94, 10)
    expect(vp.tx).toBeCloseTo((400 - 0.5 * vp.scale) / 2, 10)
    expect(vp.ty).toBeCloseTo((200 - vp.scale) / 2, 10)
  })

  it('세로가 긴 컨테이너: 너비/aspect 기준 내접', () => {
    const vp = computeFitViewport(2, 200, 400)
    expect(vp.scale).toBeCloseTo((200 / 2) * 0.94, 10)
  })
})

describe('dataToScreen / screenToData', () => {
  it('상호 역변환이다', () => {
    const vp = { scale: 123.4, tx: 17, ty: -5 }
    const aspect = 0.87
    const [sx, sy] = dataToScreen(vp, aspect, [0.3, 0.7])
    const [dx, dy] = screenToData(vp, aspect, [sx, sy])
    expect(dx).toBeCloseTo(0.3, 10)
    expect(dy).toBeCloseTo(0.7, 10)
  })

  it('화면 변환식: px = tx + x·(aspect·scale), py = ty + y·scale', () => {
    const vp = { scale: 100, tx: 10, ty: 20 }
    expect(dataToScreen(vp, 2, [0.5, 0.5])).toEqual([10 + 0.5 * 200, 20 + 0.5 * 100])
  })
})
