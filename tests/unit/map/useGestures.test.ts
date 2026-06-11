// useGestures 훅 — AC-1(임계값)·AC-2(500ms)·AC-3(휠)·AC-4(클램프)·AC-5(핀치)·AC-8(zoomBy)
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screenToData, type Viewport } from '../../../src/features/map/engine'
import { useGestures } from '../../../src/features/map/useGestures'
import type { Point } from '../../../src/utils/geo'

// jsdom에 PointerEvent가 없어 MouseEvent 확장으로 합성 — 훅은 pointerId/pointerType만 읽는다
interface PointerInit extends MouseEventInit {
  pointerId?: number
  pointerType?: string
}

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string
  constructor(type: string, init: PointerInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
  }
}

type PointerEventType = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel'

function firePointer(
  el: Element,
  type: PointerEventType,
  id: number,
  x: number,
  y: number,
  pointerType = 'touch',
) {
  act(() => {
    el.dispatchEvent(
      new TestPointerEvent(type, { pointerId: id, pointerType, clientX: x, clientY: y }),
    )
  })
}

function fireWheel(el: Element, deltaY: number, x: number, y: number) {
  act(() => {
    el.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: x, clientY: y, cancelable: true }))
  })
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** rAF 동기 실행 — 훅의 프레임 배칭을 즉시 커밋으로 평탄화 */
function stubSyncRaf() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
}

// 컨테이너 400×300, aspect=1 → fit: scale=282, tx=59, ty=9
const RECT = { x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 300, width: 400, height: 300 }
const FIT: Viewport = { scale: 300 * 0.94, tx: (400 - 300 * 0.94) / 2, ty: (300 - 300 * 0.94) / 2 }

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  container.getBoundingClientRect = () => ({ ...RECT, toJSON: () => ({}) }) as DOMRect
  const onTap = vi.fn<(point: Point) => void>()
  // ref 객체는 렌더 간 안정적이어야 한다 — 인라인 리터럴이면 fit effect가 매 렌더 재실행돼 무한 루프
  const containerRef = { current: container }
  const rendered = renderHook(() => useGestures({ containerRef, aspect: 1, onTap }))
  return { container, onTap, result: rendered.result }
}

function viewportOf(result: { current: { viewport: Viewport | null } }): Viewport {
  const vp = result.current.viewport
  expect(vp).not.toBeNull()
  return vp as Viewport
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  stubSyncRaf()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('초기 fit', () => {
  it('마운트 시 컨테이너 크기로 fit viewport를 계산한다', () => {
    const { result } = setup()
    const vp = viewportOf(result)
    expect(vp.scale).toBeCloseTo(FIT.scale, 9)
    expect(vp.tx).toBeCloseTo(FIT.tx, 9)
    expect(vp.ty).toBeCloseTo(FIT.ty, 9)
  })
})

describe('팬 임계값 (AC-1)', () => {
  it('터치 11px 이동 + 빠른 업 → onTap 1회, viewport 불변', () => {
    const { container, onTap, result } = setup()
    const before = viewportOf(result)
    firePointer(container, 'pointerdown', 1, 100, 100, 'touch')
    firePointer(container, 'pointermove', 1, 111, 100, 'touch')
    firePointer(container, 'pointerup', 1, 111, 100, 'touch')
    expect(onTap).toHaveBeenCalledTimes(1)
    // 시작 시점 스냅샷으로 변환한 데이터 좌표
    const [dx, dy] = screenToData(before, 1, [100, 100])
    expect(onTap.mock.calls[0][0][0]).toBeCloseTo(dx, 9)
    expect(onTap.mock.calls[0][0][1]).toBeCloseTo(dy, 9)
    expect(viewportOf(result)).toEqual(before)
  })

  it('터치 13px 이동 → onTap 미호출, tx만 이동량만큼 증가·scale 불변', () => {
    const { container, onTap, result } = setup()
    const before = viewportOf(result)
    firePointer(container, 'pointerdown', 1, 100, 100, 'touch')
    firePointer(container, 'pointermove', 1, 113, 100, 'touch')
    firePointer(container, 'pointerup', 1, 113, 100, 'touch')
    expect(onTap).not.toHaveBeenCalled()
    const after = viewportOf(result)
    expect(after.tx).toBeCloseTo(before.tx + 13, 9)
    expect(after.ty).toBeCloseTo(before.ty, 9)
    expect(after.scale).toBeCloseTo(before.scale, 9)
  })

  it('마우스 5px 이동 → 탭, 7px 이동 → 팬 (임계값 6px)', () => {
    const { container, onTap, result } = setup()
    const before = viewportOf(result)
    firePointer(container, 'pointerdown', 1, 100, 100, 'mouse')
    firePointer(container, 'pointermove', 1, 105, 100, 'mouse')
    firePointer(container, 'pointerup', 1, 105, 100, 'mouse')
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(viewportOf(result)).toEqual(before)

    firePointer(container, 'pointerdown', 2, 100, 100, 'mouse')
    firePointer(container, 'pointermove', 2, 107, 100, 'mouse')
    firePointer(container, 'pointerup', 2, 107, 100, 'mouse')
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(viewportOf(result).tx).toBeCloseTo(before.tx + 7, 9)
  })
})

describe('탭 시간 제한 500ms (AC-2)', () => {
  it('499ms 업은 탭, 501ms 업은 무시', () => {
    vi.useFakeTimers()
    stubSyncRaf() // useFakeTimers가 rAF를 다시 덮어쓰므로 재스텁
    const { container, onTap } = setup()

    firePointer(container, 'pointerdown', 1, 100, 100, 'touch')
    act(() => vi.advanceTimersByTime(499))
    firePointer(container, 'pointerup', 1, 100, 100, 'touch')
    expect(onTap).toHaveBeenCalledTimes(1)

    firePointer(container, 'pointerdown', 1, 100, 100, 'touch')
    act(() => vi.advanceTimersByTime(501))
    firePointer(container, 'pointerup', 1, 100, 100, 'touch')
    expect(onTap).toHaveBeenCalledTimes(1)
  })
})

describe('휠 줌 (AC-3)', () => {
  it('deltaY<0 → ×1.15, 커서 아래 데이터 좌표 고정 (1e-6)', () => {
    const { container, result } = setup()
    const before = viewportOf(result)
    const cursorData = screenToData(before, 1, [120, 80])

    fireWheel(container, -100, 120, 80)
    const after = viewportOf(result)
    expect(after.scale).toBeCloseTo(before.scale * 1.15, 9)
    const afterData = screenToData(after, 1, [120, 80])
    expect(afterData[0]).toBeCloseTo(cursorData[0], 6)
    expect(afterData[1]).toBeCloseTo(cursorData[1], 6)
  })

  it('deltaY>0 → ÷1.15', () => {
    const { container, result } = setup()
    const before = viewportOf(result)
    fireWheel(container, 100, 120, 80)
    expect(viewportOf(result).scale).toBeCloseTo(before.scale / 1.15, 9)
  })
})

describe('scale 클램프 (AC-4)', () => {
  it('휠 반복 적용해도 50..30000을 벗어나지 않는다', () => {
    const { container, result } = setup()
    for (let i = 0; i < 60; i++) fireWheel(container, -100, 200, 150)
    expect(viewportOf(result).scale).toBe(30000)
    for (let i = 0; i < 100; i++) fireWheel(container, 100, 200, 150)
    expect(viewportOf(result).scale).toBe(50)
  })

  it('zoomBy 반복 적용해도 50..30000을 벗어나지 않는다', () => {
    const { result } = setup()
    for (let i = 0; i < 20; i++) act(() => result.current.zoomBy(1.6))
    expect(viewportOf(result).scale).toBe(30000)
    for (let i = 0; i < 30; i++) act(() => result.current.zoomBy(1 / 1.6))
    expect(viewportOf(result).scale).toBe(50)
  })
})

describe('핀치 (AC-5)', () => {
  it('거리 2배 → scale 2배, 시작 중점 데이터 좌표가 현재 중점에 위치 (1e-6)', () => {
    const { container, result } = setup()
    const start = viewportOf(result)
    firePointer(container, 'pointerdown', 1, 100, 150, 'touch')
    firePointer(container, 'pointerdown', 2, 200, 150, 'touch')
    // startDist=100, startCenter=(150,150) → p2를 (300,150)으로: dist=200, center=(200,150)
    firePointer(container, 'pointermove', 2, 300, 150, 'touch')
    const pinched = viewportOf(result)
    expect(pinched.scale).toBeCloseTo(start.scale * 2, 6)
    const anchorData = screenToData(start, 1, [150, 150])
    const nowData = screenToData(pinched, 1, [200, 150])
    expect(nowData[0]).toBeCloseTo(anchorData[0], 6)
    expect(nowData[1]).toBeCloseTo(anchorData[1], 6)
  })

  it('1손가락 해제 → 남은 포인터로 팬 전환, onTap 불가', () => {
    const { container, onTap, result } = setup()
    firePointer(container, 'pointerdown', 1, 100, 150, 'touch')
    firePointer(container, 'pointerdown', 2, 200, 150, 'touch')
    firePointer(container, 'pointermove', 2, 300, 150, 'touch')
    const pinched = viewportOf(result)

    firePointer(container, 'pointerup', 2, 300, 150, 'touch')
    firePointer(container, 'pointermove', 1, 130, 150, 'touch')
    const panned = viewportOf(result)
    expect(panned.scale).toBeCloseTo(pinched.scale, 9)
    expect(panned.tx).toBeCloseTo(pinched.tx + 30, 6)
    expect(panned.ty).toBeCloseTo(pinched.ty, 6)

    firePointer(container, 'pointerup', 1, 130, 150, 'touch')
    expect(onTap).not.toHaveBeenCalled()
  })

  it('핀치 후 이동 없이 모두 떼도 onTap은 호출되지 않는다', () => {
    const { container, onTap } = setup()
    firePointer(container, 'pointerdown', 1, 100, 150, 'touch')
    firePointer(container, 'pointerdown', 2, 200, 150, 'touch')
    firePointer(container, 'pointerup', 2, 200, 150, 'touch')
    firePointer(container, 'pointerup', 1, 100, 150, 'touch')
    expect(onTap).not.toHaveBeenCalled()
  })
})

describe('zoomBy (AC-8)', () => {
  it('+ → ×1.6, 컨테이너 중앙 데이터 좌표 고정; − → ÷1.6 대칭', () => {
    const { result } = setup()
    const before = viewportOf(result)
    const centerData = screenToData(before, 1, [200, 150])

    act(() => result.current.zoomBy(1.6))
    const zoomedIn = viewportOf(result)
    expect(zoomedIn.scale).toBeCloseTo(before.scale * 1.6, 9)
    const afterData = screenToData(zoomedIn, 1, [200, 150])
    expect(afterData[0]).toBeCloseTo(centerData[0], 6)
    expect(afterData[1]).toBeCloseTo(centerData[1], 6)

    act(() => result.current.zoomBy(1 / 1.6))
    expect(viewportOf(result).scale).toBeCloseTo(before.scale, 6)
  })
})
