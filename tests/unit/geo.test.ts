import { describe, expect, it } from 'vitest'
import {
  makeProjector,
  pointInPolygon,
  polyArea,
  polyCentroid,
  type Bbox,
  type Point,
} from '../../src/utils/geo'

const UNIT_SQUARE: Point[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]

describe('makeProjector', () => {
  const bbox: Bbox = [126.517057, 37.731729, 126.567639, 37.790102]
  const proj = makeProjector(bbox)

  it('bbox 모서리를 정규화 평면 모서리로 사상한다 (y축 반전)', () => {
    expect(proj.project(bbox[0], bbox[1])).toEqual([0, 1])
    const [x, y] = proj.project(bbox[2], bbox[3])
    expect(x).toBeCloseTo(1, 12)
    expect(y).toBeCloseTo(0, 12)
  })

  it('중심 위도 보정된 가로/세로 비율을 반환한다', () => {
    const cLat = (bbox[1] + bbox[3]) / 2
    const expected = ((bbox[2] - bbox[0]) * Math.cos((cLat * Math.PI) / 180)) / (bbox[3] - bbox[1])
    expect(proj.aspect).toBeCloseTo(expected, 12)
  })
})

describe('pointInPolygon', () => {
  it('내부 점은 true, 외부 점은 false', () => {
    expect(pointInPolygon(0.5, 0.5, UNIT_SQUARE)).toBe(true)
    expect(pointInPolygon(1.5, 0.5, UNIT_SQUARE)).toBe(false)
    expect(pointInPolygon(-0.1, 0.5, UNIT_SQUARE)).toBe(false)
  })
})

describe('polyCentroid', () => {
  it('단위 정사각형의 무게중심은 (0.5, 0.5)', () => {
    const [cx, cy] = polyCentroid(UNIT_SQUARE)
    expect(cx).toBeCloseTo(0.5, 12)
    expect(cy).toBeCloseTo(0.5, 12)
  })

  it('면적 0(일직선) 폴리곤은 정점 평균으로 폴백한다', () => {
    const line: Point[] = [
      [0, 0],
      [1, 1],
      [2, 2],
    ]
    expect(polyCentroid(line)).toEqual([1, 1])
  })
})

describe('polyArea', () => {
  it('단위 정사각형 면적 1, 직각삼각형 면적 0.5', () => {
    expect(polyArea(UNIT_SQUARE)).toBeCloseTo(1, 12)
    const tri: Point[] = [
      [0, 0],
      [1, 0],
      [0, 1],
    ]
    expect(polyArea(tri)).toBeCloseTo(0.5, 12)
  })

  it('정점 순서(시계/반시계)와 무관하게 양수', () => {
    const reversed = [...UNIT_SQUARE].reverse()
    expect(polyArea(reversed)).toBeCloseTo(1, 12)
  })
})
