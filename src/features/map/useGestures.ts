// 팬/줌/핀치/탭 PointerEvent 단일화 훅 (M-3) — v1 touch/mouse 이중 핸들러와
// 고스트 마우스 600ms 가드를 폐기하고 의미론(임계값·탭 판정·줌 수식)만 보존.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Point } from '../../utils/geo'
import { computeFitViewport, screenToData, type Viewport } from './engine'
import { panThreshold, pinchZoom, zoomAt, TAP_MAX_MS, WHEEL_ZOOM_FACTOR } from './gestureMath'

interface ActivePointer {
  x: number
  y: number
  type: string
}

interface TapPanGesture {
  mode: 'tap' | 'pan'
  pointerType: string
  start: { clientX: number; clientY: number; relX: number; relY: number; t: number }
  startViewport: Viewport
}

interface PinchGesture {
  mode: 'pinch'
  startDist: number
  startCenter: Point
  startViewport: Viewport
}

type Gesture = { mode: 'idle' } | TapPanGesture | PinchGesture

const IDLE: Gesture = { mode: 'idle' }

export interface UseGesturesOptions {
  /** 렌더 간 안정 객체여야 한다(useRef) — 인라인 리터럴이면 fit effect가 매 렌더 재실행된다 */
  containerRef: RefObject<HTMLElement | null>
  /** 데이터 로드 전 null — null 동안 제스처 비활성 */
  aspect: number | null
  /** 탭 확정 시 시작 시점 viewport 스냅샷으로 변환한 데이터 좌표 (v1:635 보존) */
  onTap?: (dataPoint: Point) => void
}

export interface UseGesturesResult {
  /** 초기 fit 계산 전 null. 리사이즈 시 fit으로 리셋 (v1:93-121 보존) */
  viewport: Viewport | null
  /** 줌 버튼용 — 컨테이너 중앙 고정 ×factor */
  zoomBy: (factor: number) => void
}

export function useGestures({
  containerRef,
  aspect,
  onTap,
}: UseGesturesOptions): UseGesturesResult {
  const [viewport, setViewport] = useState<Viewport | null>(null)
  // viewportRef는 렌더 상태 미러가 아니라 rAF 커밋 전 스테이징 값 —
  // 이벤트 레이트로 갱신하고 프레임당 1회만 setViewport(명세: 렌더 갱신 프레임당 1회 이하)
  const viewportRef = useRef<Viewport | null>(null)
  const rafRef = useRef(0)
  const gestureRef = useRef<Gesture>(IDLE)
  const pointersRef = useRef(new Map<number, ActivePointer>())
  const onTapRef = useRef(onTap)

  useEffect(() => {
    onTapRef.current = onTap
  }, [onTap])

  const commit = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      setViewport(viewportRef.current)
    })
  }, [])

  // 초기 fit + 리사이즈 시 fit 리셋
  useEffect(() => {
    const container = containerRef.current
    if (!container || aspect == null) return
    const fit = () => {
      const r = container.getBoundingClientRect()
      if (!r.width || !r.height) return
      viewportRef.current = computeFitViewport(aspect, r.width, r.height)
      setViewport(viewportRef.current)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef, aspect])

  useEffect(() => {
    const container = containerRef.current
    if (!container || aspect == null) return
    const pointers = pointersRef.current

    const pinchBaseline = (startViewport: Viewport) => {
      const [p0, p1] = [...pointers.values()]
      const r = container.getBoundingClientRect()
      gestureRef.current = {
        mode: 'pinch',
        startDist: Math.hypot(p1.x - p0.x, p1.y - p0.y),
        startCenter: [(p0.x + p1.x) / 2 - r.left, (p0.y + p1.y) / 2 - r.top],
        startViewport,
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      const vp = viewportRef.current
      if (!vp) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
      try {
        container.setPointerCapture(e.pointerId)
      } catch {
        // 합성 이벤트(테스트)는 활성 포인터가 아니라 캡처 불가 — 무해
      }
      const count = pointers.size
      if (count === 1) {
        const r = container.getBoundingClientRect()
        gestureRef.current = {
          mode: 'tap',
          pointerType: e.pointerType,
          start: {
            clientX: e.clientX,
            clientY: e.clientY,
            relX: e.clientX - r.left,
            relY: e.clientY - r.top,
            t: Date.now(),
          },
          startViewport: vp,
        }
      } else if (count === 2) {
        // (tap|pan) → pinch 즉시 전환: 시작 거리·중점·viewport 재기준 (v1:554-563, 573-583)
        pinchBaseline(vp)
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const g = gestureRef.current
      if (g.mode === 'idle') return
      const p = pointers.get(e.pointerId)
      if (!p) return
      p.x = e.clientX
      p.y = e.clientY

      if (g.mode === 'pinch') {
        if (pointers.size < 2) return
        const [p0, p1] = [...pointers.values()]
        const r = container.getBoundingClientRect()
        viewportRef.current = pinchZoom(
          g.startViewport,
          aspect,
          g.startCenter,
          g.startDist,
          [(p0.x + p1.x) / 2 - r.left, (p0.y + p1.y) / 2 - r.top],
          Math.hypot(p1.x - p0.x, p1.y - p0.y),
        )
        commit()
        return
      }

      const dx = e.clientX - g.start.clientX
      const dy = e.clientY - g.start.clientY
      if (g.mode === 'tap' && Math.hypot(dx, dy) > panThreshold(g.pointerType)) {
        g.mode = 'pan'
      }
      if (g.mode === 'pan') {
        const start = g.startViewport
        viewportRef.current = { scale: start.scale, tx: start.tx + dx, ty: start.ty + dy }
        commit()
      }
    }

    const endPointer = (e: PointerEvent, allowTap: boolean) => {
      pointers.delete(e.pointerId)
      const g = gestureRef.current
      if (g.mode === 'idle') return
      const remaining = pointers.size

      if (g.mode === 'tap') {
        // 임계값 이내 + 500ms 미만만 탭 확정 — 시작 시점 viewport 스냅샷으로 변환 (v1:631-645)
        if (allowTap && Date.now() - g.start.t < TAP_MAX_MS) {
          onTapRef.current?.(screenToData(g.startViewport, aspect, [g.start.relX, g.start.relY]))
        }
        gestureRef.current = IDLE
        return
      }

      if (g.mode === 'pinch' && remaining >= 2) {
        pinchBaseline(viewportRef.current ?? g.startViewport)
        return
      }

      if (g.mode === 'pinch' && remaining === 1) {
        // 핀치 → 팬 전이: 남은 포인터 기준 재기준, 탭 불가 (v1:650-657)
        const [p] = [...pointers.values()]
        const r = container.getBoundingClientRect()
        gestureRef.current = {
          mode: 'pan',
          pointerType: p.type,
          start: {
            clientX: p.x,
            clientY: p.y,
            relX: p.x - r.left,
            relY: p.y - r.top,
            t: Date.now(),
          },
          startViewport: viewportRef.current ?? g.startViewport,
        }
        return
      }

      if (remaining === 0) gestureRef.current = IDLE
    }

    const onPointerUp = (e: PointerEvent) => endPointer(e, true)
    const onPointerCancel = (e: PointerEvent) => endPointer(e, false)

    const onWheel = (e: WheelEvent) => {
      const vp = viewportRef.current
      if (!vp) return
      e.preventDefault()
      const r = container.getBoundingClientRect()
      const factor = e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR
      viewportRef.current = zoomAt(vp, aspect, [e.clientX - r.left, e.clientY - r.top], factor)
      commit()
    }

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', onPointerUp)
    container.addEventListener('pointercancel', onPointerCancel)
    // preventDefault 필요 — passive 기본값(true)이면 휠 줌 시 페이지 스크롤을 막을 수 없다
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerCancel)
      container.removeEventListener('wheel', onWheel)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      pointers.clear()
      gestureRef.current = IDLE
    }
  }, [containerRef, aspect, commit])

  const zoomBy = useCallback(
    (factor: number) => {
      const container = containerRef.current
      const vp = viewportRef.current
      if (!container || !vp || aspect == null) return
      const r = container.getBoundingClientRect()
      viewportRef.current = zoomAt(vp, aspect, [r.width / 2, r.height / 2], factor)
      commit()
    },
    [containerRef, aspect, commit],
  )

  return { viewport, zoomBy }
}
