// renderLabels — AC-3(게이트·컬링)·AC-4(배치·halo·색 분기)·AC-5(그룹 클러스터)·AC-6(memo)·AC-7(고정 아이콘)
import { describe, expect, it } from 'vitest'
import {
  createClustersCache,
  createLabelCaches,
  createWrapTextCache,
  findClusters,
  renderLabels,
  type EngineParcel,
  type MapScene,
} from '../../../src/features/map/engine'
import { createMockLabelCtx } from './mockContext'
import { SIZE, makeGroup, makeOverride, makeScene, parcelToGroupOf, square } from './fixtures'

/** 라벨 입력(cx/cy/bw/bh)만 명시한 필지 — poly는 개별 라벨 경로에서 사용되지 않는다 */
function labelParcel(id: string, cx: number, cy: number, bw: number, bh: number): EngineParcel {
  return { id, jibun: id, poly: [], area: 0, cx, cy, bw, bh }
}

function render(scene: MapScene, charWidth = 10) {
  const mock = createMockLabelCtx(charWidth)
  renderLabels(mock.ctx, scene, SIZE, createLabelCaches())
  return mock
}

describe('renderLabels 게이트·컬링 (AC-3)', () => {
  // viewport scale=100, tx=ty=0, aspect=1 → boxW=bw·100, boxH=bh·100, px=cx·100, py=cy·100
  it('boxW ≥ 14 그리고 boxH ≥ 13이며 컬링 마진(x ±40 / y ±20) 안인 라벨만 그린다', () => {
    const scene = makeScene({
      parcels: [
        labelParcel('a', 0.5, 0.5, 0.14, 0.13), // 14×13 — 경계 포함 → 표시
        labelParcel('b', 0.5, 0.5, 0.139, 0.2), // boxW 13.9 < 14 → 생략
        labelParcel('c', 0.5, 0.5, 0.2, 0.129), // boxH 12.9 < 13 → 생략
        labelParcel('d', -0.39, 0.5, 0.2, 0.2), // px -39 ≥ -40 → 표시
        labelParcel('e', -0.41, 0.5, 0.2, 0.2), // px -41 < -40 → 생략
        labelParcel('f', 0.5, -0.19, 0.2, 0.2), // py -19 ≥ -20 → 표시
        labelParcel('g', 0.5, -0.21, 0.2, 0.2), // py -21 < -20 → 생략
        labelParcel('h', 1.39, 0.5, 0.2, 0.2), // px 139 ≤ 140 → 표시
        labelParcel('i', 1.41, 0.5, 0.2, 0.2), // px 141 > 140 → 생략
        labelParcel('j', 0.5, 1.19, 0.2, 0.2), // py 119 ≤ 120 → 표시
        labelParcel('k', 0.5, 1.21, 0.2, 0.2), // py 121 > 120 → 생략
      ],
    })
    const mock = render(scene, 5)
    expect(mock.fillTexts().map((o) => o.text)).toEqual(['a', 'd', 'f', 'h', 'j'])
  })

  it('wrapText 결과가 빈 배열(한 글자도 안 들어감)이면 생략한다', () => {
    // boxW 14 → maxLineWidth 8 < 글자폭 10 → []
    const scene = makeScene({ parcels: [labelParcel('a', 0.5, 0.5, 0.14, 0.2)] })
    expect(render(scene, 10).fillTexts()).toHaveLength(0)
  })
})

describe('renderLabels 개별 라벨 배치·halo·색 분기 (AC-4)', () => {
  // aspect=2, scale=100, tx=7, ty=3 → px = 7 + cx·200, py = 3 + cy·100
  function sceneWith(partial: Partial<MapScene>): MapScene {
    return makeScene({
      aspect: 2,
      viewport: { scale: 100, tx: 7, ty: 3 },
      parcels: [{ id: 'p1', jibun: '산10', poly: [], area: 0, cx: 0.3, cy: 0.4, bw: 0.5, bh: 0.5 }],
      ...partial,
    })
  }

  it('fillText 좌표 = (tx + cx·aspect·scale, ty + cy·scale), 1줄은 앵커 y 그대로', () => {
    const mock = render(sceneWith({}))
    const fills = mock.fillTexts()
    expect(fills).toHaveLength(1)
    expect(fills[0].text).toBe('산10')
    expect(fills[0].x).toBeCloseTo(67, 6)
    expect(fills[0].y).toBeCloseTo(43, 6)
  })

  it('각 줄마다 strokeText(halo)가 fillText보다 먼저, 폰트·halo 스타일은 보존값', () => {
    const mock = render(sceneWith({}))
    expect(mock.textOps.map((o) => o.op)).toEqual(['strokeText', 'fillText'])
    const halo = mock.strokeTexts()[0]
    expect(halo.strokeStyle).toBe('rgba(255,255,255,0.92)')
    expect(halo.lineWidth).toBe(2.5)
    expect(halo.x).toBeCloseTo(67, 6)
    expect(halo.y).toBeCloseTo(43, 6)
    expect(mock.fillTexts()[0].font).toBe(
      '600 11px Pretendard, -apple-system, system-ui, sans-serif',
    )
  })

  it('① override.name 존재 → #1A1814 (텍스트도 이름으로 대체)', () => {
    const mock = render(sceneWith({ overrides: { p1: makeOverride({ name: '내땅' }) } }))
    expect(mock.fillTexts()[0].text).toBe('내땅')
    expect(mock.fillTexts()[0].fillStyle).toBe('#1A1814')
  })

  it('② 개별 색 있는 필지 → #3A3631', () => {
    const mock = render(sceneWith({ overrides: { p1: makeOverride({ color: 'eco' }) } }))
    expect(mock.fillTexts()[0].fillStyle).toBe('#3A3631')
  })

  it('② 색 있는(이름 없는) 그룹 멤버 → #3A3631', () => {
    const groups = { g1: makeGroup({ color: 'eco', parcelIds: ['p1'] }) }
    const mock = render(sceneWith({ groups, parcelToGroup: parcelToGroupOf(groups) }))
    expect(mock.fillTexts()[0].fillStyle).toBe('#3A3631')
  })

  it('③ 기본(지번) → #5C5851', () => {
    expect(render(sceneWith({})).fillTexts()[0].fillStyle).toBe('#5C5851')
  })
})

describe('renderLabels 그룹명 클러스터 라벨 (AC-5)', () => {
  // scale=100, tx=ty=0, aspect=1. a+b 인접(변 공유), c 분리 → 클러스터 2개
  const groups = {
    g1: makeGroup({ name: '밭', parcelIds: ['a', 'b', 'c'] }),
    g2: makeGroup({ parcelIds: ['d'] }), // 이름 없는 그룹
  }
  const scene = makeScene({
    parcels: [
      square('a', 0, 0, 0.2),
      square('b', 0.2, 0, 0.2),
      square('c', 0.6, 0.6, 0.2),
      square('d', 0.6, 0, 0.2),
    ],
    groups,
    parcelToGroup: parcelToGroupOf(groups),
  })

  it('① 이름 있는 그룹 멤버의 개별 지번 라벨은 0건', () => {
    const texts = render(scene)
      .fillTexts()
      .map((o) => o.text)
    expect(texts).not.toContain('a')
    expect(texts).not.toContain('b')
    expect(texts).not.toContain('c')
  })

  it('② 그룹명이 클러스터마다 1회, 각 클러스터 화면 bbox 중심에 #1A1814로', () => {
    const groupFills = render(scene)
      .fillTexts()
      .filter((o) => o.text === '밭')
    expect(groupFills).toHaveLength(2)
    // 클러스터 a∪b: 화면 bbox (0..40)×(0..20) → 중심 (20,10)
    expect(groupFills[0].x).toBeCloseTo(20, 6)
    expect(groupFills[0].y).toBeCloseTo(10, 6)
    // 클러스터 c: (60..80)×(60..80) → 중심 (70,70)
    expect(groupFills[1].x).toBeCloseTo(70, 6)
    expect(groupFills[1].y).toBeCloseTo(70, 6)
    for (const f of groupFills) expect(f.fillStyle).toBe('#1A1814')
  })

  it('③ 이름 없는 그룹 멤버는 개별 지번 라벨 유지', () => {
    const dFills = render(scene)
      .fillTexts()
      .filter((o) => o.text === 'd')
    expect(dFills).toHaveLength(1)
    expect(dFills[0].x).toBeCloseTo(70, 6)
    expect(dFills[0].y).toBeCloseTo(10, 6)
  })
})

describe('renderLabels findClusters memo (AC-6)', () => {
  function sceneWith(g1ParcelIds: string[]): MapScene {
    const groups = {
      g1: makeGroup({ name: '밭', parcelIds: g1ParcelIds }),
      g2: makeGroup({ name: '논', parcelIds: ['c'] }),
    }
    return makeScene({
      parcels: [
        square('a', 0, 0, 0.2),
        square('b', 0.2, 0, 0.2),
        square('c', 0.6, 0.6, 0.2),
        square('d', 0.6, 0, 0.2),
      ],
      groups,
      parcelToGroup: parcelToGroupOf(groups),
    })
  }

  it('2회 렌더에도 그룹당 1회만 계산하고, parcelIds 변경 시 그 그룹만 재계산', () => {
    const calls: string[] = []
    const caches = {
      wrap: createWrapTextCache(),
      clusters: createClustersCache((members) => {
        calls.push(members.map((m) => m.id).join(','))
        return findClusters(members)
      }),
    }
    const scene = sceneWith(['a', 'b'])
    renderLabels(createMockLabelCtx().ctx, scene, SIZE, caches)
    renderLabels(createMockLabelCtx().ctx, scene, SIZE, caches)
    expect(calls).toEqual(['a,b', 'c'])

    renderLabels(createMockLabelCtx().ctx, sceneWith(['a', 'b', 'd']), SIZE, caches)
    expect(calls).toEqual(['a,b', 'c', 'a,b,d'])
  })
})

describe('renderLabels 고정 필지 아이콘 (AC-7)', () => {
  // scale=100, tx=ty=0 → cxPx=50, cyPx=30. 1줄 라벨 totalH=11
  function iconScene(ov: Partial<ReturnType<typeof makeOverride>>, bw = 0.25): MapScene {
    return makeScene({
      parcels: [labelParcel('p', 0.5, 0.3, bw, 0.2)],
      overrides: { p: makeOverride(ov) },
    })
  }
  const serifFills = (mock: ReturnType<typeof createMockLabelCtx>) =>
    mock.fillTexts().filter((o) => o.font.endsWith('px serif'))

  it('pinned + icon → serif 폰트·clamp 하한 12·(cxPx, cyPx − totalH/2 − iconSize·0.7)', () => {
    // boxW 25 → 25·0.38 = 9.5 → clamp 하한 12
    const mock = render(iconScene({ pinned: true, icon: '🌲' }))
    const icons = serifFills(mock)
    expect(icons).toHaveLength(1)
    expect(icons[0].text).toBe('🌲')
    expect(icons[0].font).toBe('12px serif')
    expect(icons[0].x).toBeCloseTo(50, 6)
    expect(icons[0].y).toBeCloseTo(30 - 11 / 2 - 12 * 0.7, 6)
    // 텍스트 줄(strokeText→fillText) 다음에 아이콘
    expect(mock.textOps.map((o) => o.op)).toEqual(['strokeText', 'fillText', 'fillText'])
  })

  it('clamp 상한 22 — boxW 100 → 38 → 22', () => {
    const mock = render(iconScene({ pinned: true, icon: '🌲' }, 1.0))
    expect(serifFills(mock)[0].font).toBe('22px serif')
  })

  it('아이콘 후 본문 폰트로 복원된다', () => {
    const mock = render(iconScene({ pinned: true, icon: '🌲' }))
    expect(mock.ctx.font).toBe('600 11px Pretendard, -apple-system, system-ui, sans-serif')
  })

  it('pinned: false 또는 icon 없음 → 아이콘 미기록', () => {
    expect(serifFills(render(iconScene({ pinned: false, icon: '🌲' })))).toHaveLength(0)
    expect(serifFills(render(iconScene({ pinned: true, icon: null })))).toHaveLength(0)
  })
})
