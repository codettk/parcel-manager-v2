import type { ParcelStyle } from '../../../types/api/tabState'
import {
  FILL_OPACITY,
  GROUP_DASH,
  MAP_COLORS,
  MAP_LINE_WIDTHS,
  SELECTED_FILL_OPACITY,
  hexA,
} from './colors'
import { createOuterEdgesCache, type Edge, type OuterEdgesCache } from './outerEdges'
import type { EngineParcel, MapScene } from './scene'

/** CSS px 크기 + DPR — 백버퍼는 호스트가 width×dpr로 잡고, 엔진은 CSS px 단위로 그린다 */
export interface RenderSize {
  width: number
  height: number
  dpr: number
}

/** 엔진이 사용하는 2D 컨텍스트 부분집합 — 실제 CanvasRenderingContext2D와 테스트 mock이 모두 만족 */
export interface Canvas2D {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  lineJoin: CanvasLineJoin
  lineCap: CanvasLineCap
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  closePath(): void
  fill(): void
  stroke(): void
  setLineDash(segments: number[]): void
}

interface ViewTransform {
  tx: number
  ty: number
  dataW: number
  dataH: number
}

interface ColoredGroupRender {
  members: EngineParcel[]
  outerEdges: Edge[]
  hex: string
  style: ParcelStyle
}

interface ColorlessGroupRender {
  members: EngineParcel[]
  outerEdges: Edge[]
}

interface GroupRenderData {
  colored: Map<string, ColoredGroupRender>
  colorless: Map<string, ColorlessGroupRender>
}

const defaultCache = createOuterEdgesCache()

/**
 * 8-pass 렌더 (v1 MapView.jsx 동작 보존 — 패스 순서 고정).
 * 1차 미지정 → 1.5차 색없는그룹 → 2차 개별색 → 3차 색있는그룹
 * → 4차 단일선택 → 5차 그룹선택 → 6차 멀티선택 → 7차 추가모드
 */
export function renderScene(
  ctx: Canvas2D,
  scene: MapScene,
  size: RenderSize,
  cache: OuterEdgesCache = defaultCache,
): void {
  const vt: ViewTransform = {
    tx: scene.viewport.tx,
    ty: scene.viewport.ty,
    dataW: scene.aspect * scene.viewport.scale,
    dataH: scene.viewport.scale,
  }
  const parcelById = new Map<string, EngineParcel>()
  for (const p of scene.parcels) parcelById.set(p.id, p)

  const groupRD = buildGroupRenderData(scene, parcelById, cache)
  cache.sweep(new Set(Object.keys(scene.groups)))

  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
  ctx.clearRect(0, 0, size.width, size.height)
  ctx.fillStyle = MAP_COLORS.background
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  drawPass1BaseParcels(ctx, scene, vt, groupRD)
  drawPass1_5ColorlessGroups(ctx, vt, groupRD)
  drawPass2ColoredParcels(ctx, scene, vt)
  drawPass3ColoredGroups(ctx, vt, groupRD)
  drawPass4SelectedParcel(ctx, scene, vt, parcelById)
  drawPass5SelectedGroup(ctx, scene, vt, parcelById, groupRD, cache)
  drawPass6MultiSelect(ctx, scene, vt, parcelById)
  drawPass7AddToGroupMembers(ctx, scene, vt, parcelById)
}

function buildGroupRenderData(
  scene: MapScene,
  parcelById: Map<string, EngineParcel>,
  cache: OuterEdgesCache,
): GroupRenderData {
  const colored = new Map<string, ColoredGroupRender>()
  const colorless = new Map<string, ColorlessGroupRender>()
  for (const [gid, g] of Object.entries(scene.groups)) {
    const members = g.parcelIds
      .map((pid) => parcelById.get(pid))
      .filter((p): p is EngineParcel => p !== undefined)
    if (!members.length) continue
    if (g.color) {
      const hex: string | undefined = scene.colorById[g.color]
      if (!hex) continue
      colored.set(gid, { members, outerEdges: cache.get(gid, members), hex, style: g.style })
    } else {
      colorless.set(gid, { members, outerEdges: cache.get(gid, members) })
    }
  }
  return { colored, colorless }
}

function tracePath(ctx: Canvas2D, vt: ViewTransform, poly: EngineParcel['poly']): void {
  ctx.beginPath()
  for (let i = 0; i < poly.length; i++) {
    const [x, y] = poly[i]
    const px = vt.tx + x * vt.dataW
    const py = vt.ty + y * vt.dataH
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/** 그룹 통합 채움용 compound path — 멤버 전체를 한 path에 누적 */
function traceCompoundPath(ctx: Canvas2D, vt: ViewTransform, members: EngineParcel[]): void {
  ctx.beginPath()
  for (const p of members) {
    for (let i = 0; i < p.poly.length; i++) {
      const [x, y] = p.poly[i]
      const px = vt.tx + x * vt.dataW
      const py = vt.ty + y * vt.dataH
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  }
}

/** 외곽 변 세그먼트 stroke (공유 변 제외분만) */
function strokeOuterEdges(
  ctx: Canvas2D,
  vt: ViewTransform,
  edges: Edge[],
  strokeStyle: string,
  lineWidth: number,
  dash?: readonly number[],
): void {
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lineWidth
  if (dash) ctx.setLineDash([...dash])
  for (const [p1, p2] of edges) {
    ctx.beginPath()
    ctx.moveTo(vt.tx + p1[0] * vt.dataW, vt.ty + p1[1] * vt.dataH)
    ctx.lineTo(vt.tx + p2[0] * vt.dataW, vt.ty + p2[1] * vt.dataH)
    ctx.stroke()
  }
  if (dash) ctx.setLineDash([])
}

/** 1차: 그룹 미소속 + 색 없는 필지 (그룹 멤버·개별 색 필지는 자기 패스에서) */
function drawPass1BaseParcels(
  ctx: Canvas2D,
  scene: MapScene,
  vt: ViewTransform,
  groupRD: GroupRenderData,
): void {
  for (const p of scene.parcels) {
    const gid: string | undefined = scene.parcelToGroup[p.id]
    if (gid && (groupRD.colored.has(gid) || groupRD.colorless.has(gid))) continue
    const ov = scene.overrides[p.id]
    if (ov?.color) continue
    tracePath(ctx, vt, p.poly)
    ctx.fillStyle = MAP_COLORS.parcelFill
    ctx.fill()
    ctx.strokeStyle = MAP_COLORS.parcelStroke
    ctx.lineWidth = MAP_LINE_WIDTHS.parcelStroke
    ctx.stroke()
  }
}

/** 1.5차: 색 없는 그룹 — 흰 compound 채움 + 점선 외곽 */
function drawPass1_5ColorlessGroups(
  ctx: Canvas2D,
  vt: ViewTransform,
  groupRD: GroupRenderData,
): void {
  for (const { members, outerEdges } of groupRD.colorless.values()) {
    traceCompoundPath(ctx, vt, members)
    ctx.fillStyle = MAP_COLORS.parcelFill
    ctx.fill()
    strokeOuterEdges(
      ctx,
      vt,
      outerEdges,
      MAP_COLORS.colorlessGroupStroke,
      MAP_LINE_WIDTHS.colorlessGroupStroke,
      GROUP_DASH,
    )
  }
}

/** 2차: 그룹 미소속 + 개별 색 필지 */
function drawPass2ColoredParcels(ctx: Canvas2D, scene: MapScene, vt: ViewTransform): void {
  for (const p of scene.parcels) {
    if (scene.parcelToGroup[p.id]) continue
    const ov = scene.overrides[p.id]
    if (!ov?.color) continue
    const hex: string | undefined = scene.colorById[ov.color]
    if (!hex) continue
    const style = ov.style ?? 'fill'
    tracePath(ctx, vt, p.poly)
    if (style === 'fill') {
      ctx.fillStyle = hexA(hex, FILL_OPACITY)
      ctx.fill()
      ctx.strokeStyle = hex
      ctx.lineWidth = MAP_LINE_WIDTHS.colorFillStroke
      ctx.stroke()
    } else {
      ctx.fillStyle = MAP_COLORS.parcelFill
      ctx.fill()
      ctx.strokeStyle = hex
      ctx.lineWidth = MAP_LINE_WIDTHS.colorBorderStroke
      ctx.stroke()
    }
  }
}

/** 3차: 색 있는 그룹 — compound 채움 + 외곽 변만 stroke */
function drawPass3ColoredGroups(ctx: Canvas2D, vt: ViewTransform, groupRD: GroupRenderData): void {
  for (const { members, outerEdges, hex, style } of groupRD.colored.values()) {
    traceCompoundPath(ctx, vt, members)
    ctx.fillStyle = style === 'fill' ? hexA(hex, FILL_OPACITY) : MAP_COLORS.parcelFill
    ctx.fill()
    strokeOuterEdges(
      ctx,
      vt,
      outerEdges,
      hex,
      style === 'fill' ? MAP_LINE_WIDTHS.colorFillStroke : MAP_LINE_WIDTHS.colorBorderStroke,
    )
  }
}

/** 4차: 단일 선택 강조 — 그룹 소속이면 그룹 색/스타일 참조 */
function drawPass4SelectedParcel(
  ctx: Canvas2D,
  scene: MapScene,
  vt: ViewTransform,
  parcelById: Map<string, EngineParcel>,
): void {
  const selectedId = scene.selection.selectedParcelId
  if (!selectedId) return
  const p = parcelById.get(selectedId)
  if (!p) return
  tracePath(ctx, vt, p.poly)
  const gid: string | undefined = scene.parcelToGroup[p.id]
  const source: { color: string | null; style: ParcelStyle | null } | undefined = gid
    ? scene.groups[gid]
    : scene.overrides[p.id]
  const hex = source?.color ? (scene.colorById[source.color] ?? null) : null
  const style = source?.style ?? 'fill'
  if (hex && style === 'fill') {
    ctx.fillStyle = hexA(hex, SELECTED_FILL_OPACITY)
    ctx.fill()
  } else if (!hex) {
    ctx.fillStyle = MAP_COLORS.colorlessSelectFill
    ctx.fill()
  }
  ctx.strokeStyle = MAP_COLORS.selectStroke
  ctx.lineWidth = MAP_LINE_WIDTHS.selectStroke
  ctx.stroke()
}

/** 5차: 선택 그룹 강조 — compound 채움 + 통합 외곽선 */
function drawPass5SelectedGroup(
  ctx: Canvas2D,
  scene: MapScene,
  vt: ViewTransform,
  parcelById: Map<string, EngineParcel>,
  groupRD: GroupRenderData,
  cache: OuterEdgesCache,
): void {
  const gid = scene.selection.selectedGroupId
  if (!gid) return
  const g: MapScene['groups'][string] | undefined = scene.groups[gid]
  if (!g) return
  const rd = groupRD.colored.get(gid) ?? groupRD.colorless.get(gid)
  const members = rd
    ? rd.members
    : g.parcelIds
        .map((pid) => parcelById.get(pid))
        .filter((p): p is EngineParcel => p !== undefined)
  if (!members.length) return
  const outerEdges = rd ? rd.outerEdges : cache.get(gid, members)
  const hex = g.color ? (scene.colorById[g.color] ?? null) : null
  if (hex && g.style === 'fill') {
    traceCompoundPath(ctx, vt, members)
    ctx.fillStyle = hexA(hex, SELECTED_FILL_OPACITY)
    ctx.fill()
  } else if (!hex) {
    traceCompoundPath(ctx, vt, members)
    ctx.fillStyle = MAP_COLORS.colorlessSelectFill
    ctx.fill()
  }
  strokeOuterEdges(ctx, vt, outerEdges, MAP_COLORS.selectStroke, MAP_LINE_WIDTHS.selectStroke)
}

/** 6차: 멀티선택 — 6-1 그룹 소속(미선택) 탭 힌트 / 6-2 선택 필지 오버레이 */
function drawPass6MultiSelect(
  ctx: Canvas2D,
  scene: MapScene,
  vt: ViewTransform,
  parcelById: Map<string, EngineParcel>,
): void {
  if (!scene.selection.multiSelectMode) return
  const selectedSet = new Set(scene.selection.multiSelectedIds)
  for (const g of Object.values(scene.groups)) {
    for (const pid of g.parcelIds) {
      if (selectedSet.has(pid)) continue
      const p = parcelById.get(pid)
      if (!p) continue
      tracePath(ctx, vt, p.poly)
      ctx.strokeStyle = MAP_COLORS.multiHintStroke
      ctx.lineWidth = MAP_LINE_WIDTHS.multiHintStroke
      ctx.stroke()
    }
  }
  for (const pid of scene.selection.multiSelectedIds) {
    const p = parcelById.get(pid)
    if (!p) continue
    tracePath(ctx, vt, p.poly)
    ctx.fillStyle = MAP_COLORS.multiSelectFill
    ctx.fill()
    ctx.strokeStyle = MAP_COLORS.multiSelectStroke
    ctx.lineWidth = MAP_LINE_WIDTHS.selectStroke
    ctx.stroke()
  }
}

/** 7차: 필지 추가 모드 중인 그룹 멤버 — 점선 강조 */
function drawPass7AddToGroupMembers(
  ctx: Canvas2D,
  scene: MapScene,
  vt: ViewTransform,
  parcelById: Map<string, EngineParcel>,
): void {
  const gid = scene.selection.addToGroupModeGroupId
  if (!gid) return
  const g: MapScene['groups'][string] | undefined = scene.groups[gid]
  if (!g) return
  for (const pid of g.parcelIds) {
    const p = parcelById.get(pid)
    if (!p) continue
    tracePath(ctx, vt, p.poly)
    ctx.fillStyle = MAP_COLORS.addModeFill
    ctx.fill()
    ctx.strokeStyle = MAP_COLORS.selectStroke
    ctx.lineWidth = MAP_LINE_WIDTHS.selectStroke
    ctx.setLineDash([...GROUP_DASH])
    ctx.stroke()
    ctx.setLineDash([])
  }
}
