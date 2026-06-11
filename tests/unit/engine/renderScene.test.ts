import { describe, expect, it } from 'vitest'
import {
  FILL_OPACITY,
  createOuterEdgesCache,
  hexA,
  renderScene,
  type MapScene,
} from '../../../src/features/map/engine'
import { createMockCtx, splitPathSegments, type StrokeOp } from './mockContext'
import { SIZE, makeGroup, makeOverride, makeScene, square } from './fixtures'

const RED = '#FF0000'
const GREEN = '#00FF00'

function render(scene: MapScene) {
  const mock = createMockCtx()
  renderScene(mock.ctx, scene, SIZE, createOuterEdgesCache())
  return mock
}

/** 8개 패스를 전부 활성화하는 대표 씬 (AC-1) */
function fullScene(): MapScene {
  const groups = {
    gNo: makeGroup({ parcelIds: ['gA', 'gB'] }),
    gCol: makeGroup({ color: 'green', parcelIds: ['cA', 'cB'] }),
  }
  return makeScene({
    parcels: [
      square('pPlain', 0, 0),
      square('pColor', 0.2, 0),
      square('gA', 0.4, 0),
      square('gB', 0.5, 0),
      square('cA', 0.4, 0.2),
      square('cB', 0.5, 0.2),
    ],
    overrides: { pColor: makeOverride({ color: 'red', style: 'fill' }) },
    groups,
    colorById: { red: RED, green: GREEN },
    selection: {
      selectedParcelId: 'pPlain',
      selectedGroupId: 'gCol',
      multiSelectMode: true,
      multiSelectedIds: ['pColor'],
      addToGroupModeGroupId: 'gNo',
    },
  })
}

describe('renderScene — 초기화', () => {
  it('dpr 변환 설정 후 배경 #FBFAF6을 전체 채운다', () => {
    const mock = createMockCtx()
    renderScene(mock.ctx, makeScene(), { width: 200, height: 100, dpr: 2 }, createOuterEdgesCache())
    const [first, second, third] = mock.ops
    expect(first).toEqual({ op: 'setTransform', args: [2, 0, 0, 2, 0, 0] })
    expect(second).toEqual({ op: 'clearRect' })
    expect(third).toEqual({ op: 'fillRect', fillStyle: '#FBFAF6' })
  })
})

describe('renderScene — AC-1 패스 순서', () => {
  it('1차 → 1.5차 → 2차 → 3차 → 4차 → 5차 → 6차 → 7차 순서로 그린다', () => {
    const mock = render(fullScene())
    const strokes = mock.strokes()
    const styleAt = (s: StrokeOp) => s.strokeStyle

    const i1 = strokes.findIndex((s) => styleAt(s) === '#C9C4B6')
    const i15 = strokes.findIndex((s) => styleAt(s) === 'rgba(90, 110, 190, 0.55)')
    const i2 = strokes.findIndex((s) => styleAt(s) === RED)
    const i3 = strokes.findIndex((s) => styleAt(s) === GREEN)
    const selectIdx = strokes
      .map((s, i) => (styleAt(s) === '#1F5A38' ? i : -1))
      .filter((i) => i >= 0)
    const i4 = selectIdx[0] // 4차: 단일 선택 (1개 stroke)
    const i5 = selectIdx[1] // 5차: 그룹 선택 외곽 변
    const i6Hint = strokes.findIndex((s) => styleAt(s) === 'rgba(59, 130, 246, 0.6)')
    const i6Sel = strokes.findIndex((s) => styleAt(s) === '#2F7D4F')
    const i7 = strokes.findIndex(
      (s) => styleAt(s) === '#1F5A38' && s.lineDash.length === 2 && s.lineDash[0] === 6,
    )

    for (const idx of [i1, i15, i2, i3, i4, i5, i6Hint, i6Sel, i7]) {
      expect(idx).toBeGreaterThanOrEqual(0)
    }
    expect(i1).toBeLessThan(i15)
    expect(i15).toBeLessThan(i2)
    expect(i2).toBeLessThan(i3)
    expect(i3).toBeLessThan(i4)
    expect(i4).toBeLessThan(i5)
    expect(i5).toBeLessThan(i6Hint)
    expect(i6Hint).toBeLessThan(i6Sel)
    expect(i6Sel).toBeLessThan(i7)
  })
})

describe('renderScene — AC-2 패스별 스타일 값', () => {
  it('1차: 미지정 필지 #FFFFFF 채움 + #C9C4B6 0.6px', () => {
    const mock = render(makeScene({ parcels: [square('p1', 0, 0)] }))
    expect(mock.fills()).toEqual([{ op: 'fill', fillStyle: '#FFFFFF' }])
    expect(mock.strokes()).toEqual([
      { op: 'stroke', strokeStyle: '#C9C4B6', lineWidth: 0.6, lineDash: [] },
    ])
  })

  it('1.5차: 색 없는 그룹 — 흰 compound 채움 + rgba(90,110,190,0.55) 1.8px dash [6,4]', () => {
    const mock = render(
      makeScene({
        parcels: [square('a', 0, 0), square('b', 0.1, 0)],
        groups: { g1: makeGroup({ parcelIds: ['a', 'b'] }) },
      }),
    )
    expect(mock.fills()).toEqual([{ op: 'fill', fillStyle: '#FFFFFF' }])
    const strokes = mock.strokes()
    expect(strokes).toHaveLength(6) // 인접 사각형 2개 외곽 변 6개
    for (const s of strokes) {
      expect(s.strokeStyle).toBe('rgba(90, 110, 190, 0.55)')
      expect(s.lineWidth).toBe(1.8)
      expect(s.lineDash).toEqual([6, 4])
    }
  })

  it('2차 fill 스타일: hexA(hex, 0.55) 채움 + hex 1.4px', () => {
    const mock = render(
      makeScene({
        parcels: [square('p1', 0, 0)],
        overrides: { p1: makeOverride({ color: 'red', style: 'fill' }) },
        colorById: { red: RED },
      }),
    )
    expect(hexA(RED, FILL_OPACITY)).toBe('rgba(255,0,0,0.55)')
    expect(mock.fills()).toEqual([{ op: 'fill', fillStyle: 'rgba(255,0,0,0.55)' }])
    expect(mock.strokes()).toEqual([
      { op: 'stroke', strokeStyle: RED, lineWidth: 1.4, lineDash: [] },
    ])
  })

  it('2차 border 스타일: #FFFFFF 채움 + hex 2.6px', () => {
    const mock = render(
      makeScene({
        parcels: [square('p1', 0, 0)],
        overrides: { p1: makeOverride({ color: 'red', style: 'border' }) },
        colorById: { red: RED },
      }),
    )
    expect(mock.fills()).toEqual([{ op: 'fill', fillStyle: '#FFFFFF' }])
    expect(mock.strokes()).toEqual([
      { op: 'stroke', strokeStyle: RED, lineWidth: 2.6, lineDash: [] },
    ])
  })

  it('3차: 색 있는 그룹 — compound 채움 hexA(hex, 0.55) + 외곽 변 hex 1.4px', () => {
    const mock = render(
      makeScene({
        parcels: [square('a', 0, 0), square('b', 0.1, 0)],
        groups: { g1: makeGroup({ color: 'green', parcelIds: ['a', 'b'] }) },
        colorById: { green: GREEN },
      }),
    )
    expect(mock.fills()).toEqual([{ op: 'fill', fillStyle: 'rgba(0,255,0,0.55)' }])
    const strokes = mock.strokes()
    expect(strokes).toHaveLength(6)
    for (const s of strokes) {
      expect(s.strokeStyle).toBe(GREEN)
      expect(s.lineWidth).toBe(1.4)
      expect(s.lineDash).toEqual([])
    }
  })

  it('4차 무색 선택: rgba(47,125,79,0.18) 채움 + #1F5A38 3px', () => {
    const mock = render(
      makeScene({
        parcels: [square('p1', 0, 0)],
        selection: {
          selectedParcelId: 'p1',
          selectedGroupId: null,
          multiSelectMode: false,
          multiSelectedIds: [],
          addToGroupModeGroupId: null,
        },
      }),
    )
    // 1차(흰 채움) 다음에 4차 선택 채움
    expect(mock.fills().map((f) => f.fillStyle)).toEqual(['#FFFFFF', 'rgba(47, 125, 79, 0.18)'])
    const last = mock.strokes().at(-1)
    expect(last).toEqual({ op: 'stroke', strokeStyle: '#1F5A38', lineWidth: 3, lineDash: [] })
  })

  it('4차 유색 fill 선택: hexA(hex, min(0.55+0.2, 0.9)) 채움', () => {
    const mock = render(
      makeScene({
        parcels: [square('p1', 0, 0)],
        overrides: { p1: makeOverride({ color: 'red', style: 'fill' }) },
        colorById: { red: RED },
        selection: {
          selectedParcelId: 'p1',
          selectedGroupId: null,
          multiSelectMode: false,
          multiSelectedIds: [],
          addToGroupModeGroupId: null,
        },
      }),
    )
    // 리터럴 고정 — 구현 상수 재참조는 v1 보존 공식(0.55+0.2=0.75, 상한 0.9)을 보호하지 못한다
    expect(mock.fills().at(-1)?.fillStyle).toBe('rgba(255,0,0,0.75)')
  })

  it('4차 유색 border 선택: 추가 채움 없이 #1F5A38 3px 테두리만', () => {
    const mock = render(
      makeScene({
        parcels: [square('p1', 0, 0)],
        overrides: { p1: makeOverride({ color: 'red', style: 'border' }) },
        colorById: { red: RED },
        selection: {
          selectedParcelId: 'p1',
          selectedGroupId: null,
          multiSelectMode: false,
          multiSelectedIds: [],
          addToGroupModeGroupId: null,
        },
      }),
    )
    // 2차 border의 #FFFFFF 채움 1건뿐 — 4차는 채움 없음
    expect(mock.fills()).toEqual([{ op: 'fill', fillStyle: '#FFFFFF' }])
    expect(mock.strokes().at(-1)).toEqual({
      op: 'stroke',
      strokeStyle: '#1F5A38',
      lineWidth: 3,
      lineDash: [],
    })
  })

  it('6차: 그룹 힌트 rgba(59,130,246,0.6) 2px + 선택 rgba(47,125,79,0.25)/#2F7D4F 3px', () => {
    const mock = render(
      makeScene({
        parcels: [square('a', 0, 0), square('b', 0.2, 0), square('m', 0.4, 0)],
        groups: { g1: makeGroup({ parcelIds: ['a', 'b'] }) },
        selection: {
          selectedParcelId: null,
          selectedGroupId: null,
          multiSelectMode: true,
          multiSelectedIds: ['m', 'b'],
          addToGroupModeGroupId: null,
        },
      }),
    )
    const strokes = mock.strokes()
    const hint = strokes.filter((s) => s.strokeStyle === 'rgba(59, 130, 246, 0.6)')
    expect(hint).toHaveLength(1) // b는 선택되어 6-2로, a만 힌트
    expect(hint[0].lineWidth).toBe(2)
    const sel = strokes.filter((s) => s.strokeStyle === '#2F7D4F')
    expect(sel).toHaveLength(2)
    for (const s of sel) expect(s.lineWidth).toBe(3)
    expect(mock.fills().filter((f) => f.fillStyle === 'rgba(47, 125, 79, 0.25)')).toHaveLength(2)
  })

  it('7차: 추가 모드 — rgba(47,125,79,0.30) 채움 + #1F5A38 3px dash [6,4] 후 dash 해제', () => {
    const mock = render(
      makeScene({
        parcels: [square('a', 0, 0)],
        groups: { g1: makeGroup({ parcelIds: ['a'] }) },
        selection: {
          selectedParcelId: null,
          selectedGroupId: null,
          multiSelectMode: false,
          multiSelectedIds: [],
          addToGroupModeGroupId: 'g1',
        },
      }),
    )
    expect(mock.fills().at(-1)?.fillStyle).toBe('rgba(47, 125, 79, 0.30)')
    expect(mock.strokes().at(-1)).toEqual({
      op: 'stroke',
      strokeStyle: '#1F5A38',
      lineWidth: 3,
      lineDash: [6, 4],
    })
    const lastDash = mock.ops.filter((o) => o.op === 'setLineDash').at(-1)
    expect(lastDash).toEqual({ op: 'setLineDash', segments: [] })
  })
})

describe('renderScene — AC-5 패스 배정 (제외 규칙)', () => {
  it('개별 색 필지는 2차에서만, 그룹 멤버는 3차 compound에서만, 미지정 필지만 1차', () => {
    const scene = makeScene({
      parcels: [
        square('pD', 0, 0),
        square('pA', 0.2, 0),
        square('pB', 0.4, 0.2),
        square('pC', 0.5, 0.2),
      ],
      overrides: { pA: makeOverride({ color: 'red', style: 'fill' }) },
      groups: { gCol: makeGroup({ color: 'green', parcelIds: ['pB', 'pC'] }) },
      colorById: { red: RED, green: GREEN },
    })
    const mock = render(scene)
    const segments = splitPathSegments(mock.ops)

    // 1차 스타일(#C9C4B6) stroke는 미지정 필지 pD 1건뿐
    const basePassStrokes = mock.strokes().filter((s) => s.strokeStyle === '#C9C4B6')
    expect(basePassStrokes).toHaveLength(1)

    // pA(첫 정점 화면좌표 (20,0))는 2차 시그니처(빨강 1.4px)로 그려진다
    const pASegments = segments.filter(
      (seg) => seg.moveTos[0]?.[0] === 20 && seg.moveTos[0]?.[1] === 0,
    )
    expect(pASegments).toHaveLength(1)
    expect(pASegments[0].strokes).toEqual([
      { op: 'stroke', strokeStyle: RED, lineWidth: 1.4, lineDash: [] },
    ])
    expect(pASegments[0].fills).toEqual([{ op: 'fill', fillStyle: 'rgba(255,0,0,0.55)' }])

    // pB(첫 정점 (40,20))의 채움은 3차 그룹 compound 채움 1건뿐 (1차 흰 채움 없음)
    const pBFillSegments = segments.filter(
      (seg) => seg.fills.length > 0 && seg.moveTos.some(([x, y]) => x === 40 && y === 20),
    )
    expect(pBFillSegments).toHaveLength(1)
    expect(pBFillSegments[0].fills).toEqual([{ op: 'fill', fillStyle: 'rgba(0,255,0,0.55)' }])

    // pD(첫 정점 (0,0))는 1차에서 그려진다
    const pDSegments = segments.filter(
      (seg) => seg.moveTos[0]?.[0] === 0 && seg.moveTos[0]?.[1] === 0,
    )
    expect(pDSegments).toHaveLength(1)
    expect(pDSegments[0].strokes[0]?.strokeStyle).toBe('#C9C4B6')
  })
})
