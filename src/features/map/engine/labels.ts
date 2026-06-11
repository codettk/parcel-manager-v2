import { LABEL_COLORS } from './colors'
import { createClustersCache, type ClustersCache } from './clusters'
import { createWrapTextCache, type WrapTextCache } from './wrapText'
import type { RenderSize } from './renderScene'
import type { EngineParcel, MapScene } from './scene'

// v1 MapView.jsx 라벨 레이어 보존 상수
export const LABEL_FONT_SIZE = 11
export const LABEL_LINE_HEIGHT = 13
export const LABEL_FONT = `600 ${LABEL_FONT_SIZE}px Pretendard, -apple-system, system-ui, sans-serif`
const PADDING = 4
const HALO_LINE_WIDTH = 2.5
/** 표시 게이트 — 투영 박스가 이보다 작으면 라벨 생략 (전역 줌 임계값은 존재하지 않는다) */
const MIN_BOX_W = 14
const MIN_BOX_H = LABEL_FONT_SIZE + 2
/** 화면 밖 컬링 마진 — x ±40 / y ±20 */
const CULL_MARGIN_X = 40
const CULL_MARGIN_Y = 20

/** 라벨 캔버스가 요구하는 2D 컨텍스트 부분집합 — 실제 컨텍스트와 테스트 mock이 모두 만족 */
export interface LabelCanvas2D {
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  measureText(text: string): { width: number }
  strokeText(text: string, x: number, y: number): void
  fillText(text: string, x: number, y: number): void
}

export interface LabelCaches {
  wrap: WrapTextCache
  clusters: ClustersCache
}

export function createLabelCaches(): LabelCaches {
  return { wrap: createWrapTextCache(), clusters: createClustersCache() }
}

const defaultCaches = createLabelCaches()

interface ViewTransform {
  tx: number
  ty: number
  dataW: number
  dataH: number
}

/**
 * 라벨 렌더 (v1 MapView.jsx:380-511 동작 보존) — 메인 캔버스와 같은 MapScene·같은
 * 프레임에 별도 라벨 캔버스로 그린다. 개별 필지 라벨(지번/이름/고정 아이콘) 후
 * 이름 있는 그룹의 클러스터별 그룹명 라벨.
 */
export function renderLabels(
  ctx: LabelCanvas2D,
  scene: MapScene,
  size: RenderSize,
  caches: LabelCaches = defaultCaches,
): void {
  const vt: ViewTransform = {
    tx: scene.viewport.tx,
    ty: scene.viewport.ty,
    dataW: scene.aspect * scene.viewport.scale,
    dataH: scene.viewport.scale,
  }

  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
  ctx.clearRect(0, 0, size.width, size.height)
  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  drawParcelLabels(ctx, scene, vt, size, caches)
  drawGroupLabels(ctx, scene, vt, size, caches)
  caches.clusters.sweep(new Set(Object.keys(scene.groups)))
}

function culled(cxPx: number, cyPx: number, size: RenderSize): boolean {
  return (
    cxPx < -CULL_MARGIN_X ||
    cyPx < -CULL_MARGIN_Y ||
    cxPx > size.width + CULL_MARGIN_X ||
    cyPx > size.height + CULL_MARGIN_Y
  )
}

function wrapFor(
  ctx: LabelCanvas2D,
  caches: LabelCaches,
  text: string,
  boxW: number,
  boxH: number,
): string[] {
  const maxLineWidth = Math.max(8, boxW - PADDING * 2)
  const maxLines = Math.max(
    1,
    Math.floor((boxH - PADDING * 2 + LABEL_LINE_HEIGHT - LABEL_FONT_SIZE) / LABEL_LINE_HEIGHT),
  )
  return caches.wrap.get(ctx, text, maxLineWidth, maxLines)
}

/** 각 줄 strokeText(halo) → fillText. 세로 중앙 배치. totalH 반환(아이콘 y 계산용) */
function drawLines(ctx: LabelCanvas2D, lines: string[], cxPx: number, cyPx: number): number {
  const totalH = lines.length * LABEL_LINE_HEIGHT - (LABEL_LINE_HEIGHT - LABEL_FONT_SIZE)
  const startY = cyPx - totalH / 2 + LABEL_FONT_SIZE / 2
  ctx.lineWidth = HALO_LINE_WIDTH
  ctx.strokeStyle = LABEL_COLORS.halo
  for (let i = 0; i < lines.length; i++) {
    const ly = startY + i * LABEL_LINE_HEIGHT
    ctx.strokeText(lines[i], cxPx, ly)
    ctx.fillText(lines[i], cxPx, ly)
  }
  return totalH
}

/** 개별 필지 라벨 — 이름 있는 그룹 멤버 제외 (v1과 동일하게 고정 아이콘도 함께 생략) */
function drawParcelLabels(
  ctx: LabelCanvas2D,
  scene: MapScene,
  vt: ViewTransform,
  size: RenderSize,
  caches: LabelCaches,
): void {
  const inNamedGroup = new Set<string>()
  for (const g of Object.values(scene.groups)) {
    if (!g.name) continue
    for (const pid of g.parcelIds) inNamedGroup.add(pid)
  }

  for (const p of scene.parcels) {
    if (inNamedGroup.has(p.id)) continue
    const ov = scene.overrides[p.id]
    const name = ov?.name || p.jibun
    if (!name) continue

    const cxPx = vt.tx + p.cx * vt.dataW
    const cyPx = vt.ty + p.cy * vt.dataH
    if (culled(cxPx, cyPx, size)) continue

    const boxW = p.bw * vt.dataW
    const boxH = p.bh * vt.dataH
    if (boxW < MIN_BOX_W || boxH < MIN_BOX_H) continue

    const lines = wrapFor(ctx, caches, name, boxW, boxH)
    if (lines.length === 0) continue

    const gid: string | undefined = scene.parcelToGroup[p.id]
    const g = gid ? scene.groups[gid] : undefined
    const isCustom = Boolean(ov?.name)
    const isColored = Boolean(g?.color || ov?.color)
    ctx.fillStyle = isCustom
      ? LABEL_COLORS.customName
      : isColored
        ? LABEL_COLORS.colored
        : LABEL_COLORS.base

    const totalH = drawLines(ctx, lines, cxPx, cyPx)

    if (ov?.pinned && ov.icon) {
      const iconSize = Math.max(12, Math.min(22, boxW * 0.38))
      ctx.font = `${iconSize}px serif`
      ctx.fillText(ov.icon, cxPx, cyPx - totalH / 2 - iconSize * 0.7)
      // 본문 폰트 복원 — 이후 measureText·라벨 렌더 정합
      ctx.font = LABEL_FONT
    }
  }
}

/** 그룹명 라벨 — 이름 있는 그룹의 인접 클러스터마다 화면 bbox 중심에 1개 */
function drawGroupLabels(
  ctx: LabelCanvas2D,
  scene: MapScene,
  vt: ViewTransform,
  size: RenderSize,
  caches: LabelCaches,
): void {
  const parcelById = new Map<string, EngineParcel>()
  for (const p of scene.parcels) parcelById.set(p.id, p)

  for (const [gid, g] of Object.entries(scene.groups)) {
    if (!g.name) continue
    const members = g.parcelIds
      .map((pid) => parcelById.get(pid))
      .filter((p): p is EngineParcel => p !== undefined)
    if (!members.length) continue

    for (const cluster of caches.clusters.get(gid, members)) {
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const m of cluster) {
        for (const [x, y] of m.poly) {
          const px = vt.tx + x * vt.dataW
          const py = vt.ty + y * vt.dataH
          if (px < minX) minX = px
          if (px > maxX) maxX = px
          if (py < minY) minY = py
          if (py > maxY) maxY = py
        }
      }

      const cxPx = (minX + maxX) / 2
      const cyPx = (minY + maxY) / 2
      if (culled(cxPx, cyPx, size)) continue

      const boxW = maxX - minX
      const boxH = maxY - minY
      if (boxW < MIN_BOX_W || boxH < MIN_BOX_H) continue

      const lines = wrapFor(ctx, caches, g.name, boxW, boxH)
      if (lines.length === 0) continue

      ctx.fillStyle = LABEL_COLORS.customName
      drawLines(ctx, lines, cxPx, cyPx)
    }
  }
}
