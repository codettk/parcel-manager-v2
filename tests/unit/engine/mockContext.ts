// renderScene 검증용 콜 기록 mock 2D 컨텍스트 — fill/stroke 시점의 스타일 값을 함께 기록한다
import type { Canvas2D } from '../../../src/features/map/engine'

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
