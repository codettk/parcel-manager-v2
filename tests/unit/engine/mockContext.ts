// renderScene 검증용 콜 기록 mock 2D 컨텍스트 — fill/stroke 시점의 스타일 값을 함께 기록한다
import type { Canvas2D, LabelCanvas2D } from '../../../src/features/map/engine'

export type RecordedOp =
  | { op: 'setTransform'; args: [number, number, number, number, number, number] }
  | { op: 'clearRect' }
  | { op: 'fillRect'; fillStyle: string }
  | { op: 'beginPath' }
  | { op: 'moveTo'; x: number; y: number }
  | { op: 'lineTo'; x: number; y: number }
  | { op: 'closePath' }
  | { op: 'fill'; fillStyle: string }
  | { op: 'stroke'; strokeStyle: string; lineWidth: number; lineDash: number[] }
  | { op: 'setLineDash'; segments: number[] }

export type FillOp = Extract<RecordedOp, { op: 'fill' }>
export type StrokeOp = Extract<RecordedOp, { op: 'stroke' }>

export interface MockCtx {
  ctx: Canvas2D
  ops: RecordedOp[]
  fills(): FillOp[]
  strokes(): StrokeOp[]
}

export function createMockCtx(): MockCtx {
  const ops: RecordedOp[] = []
  let lineDash: number[] = []
  const ctx: Canvas2D = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: 'miter',
    lineCap: 'butt',
    setTransform(a, b, c, d, e, f) {
      ops.push({ op: 'setTransform', args: [a, b, c, d, e, f] })
    },
    clearRect() {
      ops.push({ op: 'clearRect' })
    },
    fillRect() {
      ops.push({ op: 'fillRect', fillStyle: ctx.fillStyle as string })
    },
    beginPath() {
      ops.push({ op: 'beginPath' })
    },
    moveTo(x, y) {
      ops.push({ op: 'moveTo', x, y })
    },
    lineTo(x, y) {
      ops.push({ op: 'lineTo', x, y })
    },
    closePath() {
      ops.push({ op: 'closePath' })
    },
    fill() {
      ops.push({ op: 'fill', fillStyle: ctx.fillStyle as string })
    },
    stroke() {
      ops.push({
        op: 'stroke',
        strokeStyle: ctx.strokeStyle as string,
        lineWidth: ctx.lineWidth,
        lineDash: [...lineDash],
      })
    },
    setLineDash(segments) {
      lineDash = [...segments]
      ops.push({ op: 'setLineDash', segments: [...segments] })
    },
  }
  return {
    ctx,
    ops,
    fills: () => ops.filter((o): o is FillOp => o.op === 'fill'),
    strokes: () => ops.filter((o): o is StrokeOp => o.op === 'stroke'),
  }
}

// ─ 라벨 캔버스 mock (renderLabels 검증용) ─

export interface TextOp {
  op: 'strokeText' | 'fillText'
  text: string
  x: number
  y: number
  font: string
  fillStyle: string
  strokeStyle: string
  lineWidth: number
}

export interface MockLabelCtx {
  ctx: LabelCanvas2D
  textOps: TextOp[]
  fillTexts(): TextOp[]
  strokeTexts(): TextOp[]
  measureCount(): number
}

/** 글자당 charWidth px의 결정적 measureText — '…'·이모지도 코드포인트 1개 = 1글자 취급 */
export function createMockLabelCtx(charWidth = 10): MockLabelCtx {
  const textOps: TextOp[] = []
  let measureCalls = 0
  const record = (op: TextOp['op'], text: string, x: number, y: number) => {
    textOps.push({
      op,
      text,
      x,
      y,
      font: ctx.font,
      fillStyle: ctx.fillStyle as string,
      strokeStyle: ctx.strokeStyle as string,
      lineWidth: ctx.lineWidth,
    })
  }
  const ctx: LabelCanvas2D = {
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    setTransform() {},
    clearRect() {},
    measureText(text) {
      measureCalls++
      return { width: Array.from(text).length * charWidth }
    },
    strokeText(text, x, y) {
      record('strokeText', text, x, y)
    },
    fillText(text, x, y) {
      record('fillText', text, x, y)
    },
  }
  return {
    ctx,
    textOps,
    fillTexts: () => textOps.filter((o) => o.op === 'fillText'),
    strokeTexts: () => textOps.filter((o) => o.op === 'strokeText'),
    measureCount: () => measureCalls,
  }
}

/** beginPath 단위로 ops를 path 세그먼트로 분해 (어느 필지가 어느 패스에서 그려졌는지 추적용) */
export interface PathSegment {
  moveTos: [number, number][]
  fills: FillOp[]
  strokes: StrokeOp[]
}

export function splitPathSegments(ops: RecordedOp[]): PathSegment[] {
  const segments: PathSegment[] = []
  let current: PathSegment | null = null
  for (const op of ops) {
    if (op.op === 'beginPath') {
      current = { moveTos: [], fills: [], strokes: [] }
      segments.push(current)
      continue
    }
    if (!current) continue
    if (op.op === 'moveTo') current.moveTos.push([op.x, op.y])
    else if (op.op === 'fill') current.fills.push(op)
    else if (op.op === 'stroke') current.strokes.push(op)
  }
  return segments
}
