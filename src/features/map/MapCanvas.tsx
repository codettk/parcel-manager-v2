// 얇은 React 호스트 — parcels.json 로드·캔버스/DPR 관리·제스처 연결만 하고 렌더는 엔진에 위임.
// 씬 데이터(overrides/groups/selection)는 props 주입 — M-5 스토어 도입 전까지 App은 빈 값으로 구동.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { IconButton } from '../../components/ui'
import { makeProjector, polyArea, polyCentroid, type Bbox } from '../../utils/geo'
import type { Group, ParcelOverride } from '../../types/api/tabState'
import {
  EMPTY_SELECTION,
  MAX_DPR,
  createLabelCaches,
  createOuterEdgesCache,
  hitTest,
  renderLabels,
  renderScene,
  type EngineParcel,
  type LabelCaches,
  type OuterEdgesCache,
  type SelectionState,
} from './engine'
import { useGestures } from './useGestures'
import { BUTTON_ZOOM_FACTOR } from './gestureMath'
import { ALL_JIMOK, visibleParcelIds, type JimokKey } from './jimok'

interface RawParcel {
  id: string
  jibun: string
  c: [number, number][]
}

interface RawData {
  bbox: Bbox
  parcels: RawParcel[]
}

interface MapData {
  aspect: number
  parcels: EngineParcel[]
}

interface MapCanvasProps {
  overrides?: Record<string, ParcelOverride>
  groups?: Record<string, Group>
  colorById?: Record<string, string>
  selection?: SelectionState
  /**
   * 지목 필터 (M-14) — 선택 지목 배열. 가려진 필지는 안 그려지고·안 탭되고·라벨도 없다
   * (scene.parcels·hitTest·라벨 캔버스 동일 가시 집합). 미지정 시 6종 전체(전부 가시).
   */
  jimokFilter?: JimokKey[]
  /** 탭 히트테스트 결과 — 필지 id 또는 빈 곳 탭 시 null (선택 상태는 호스트 소관) */
  onParcelTap?: (parcelId: string | null) => void
}

const EMPTY_OVERRIDES: Record<string, ParcelOverride> = {}
const EMPTY_GROUPS: Record<string, Group> = {}
const EMPTY_COLOR_BY_ID: Record<string, string> = {}
const DEFAULT_JIMOK_FILTER: JimokKey[] = [...ALL_JIMOK]

export function MapCanvas({
  overrides = EMPTY_OVERRIDES,
  groups = EMPTY_GROUPS,
  colorById = EMPTY_COLOR_BY_ID,
  selection = EMPTY_SELECTION,
  jimokFilter = DEFAULT_JIMOK_FILTER,
  onParcelTap,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelCanvasRef = useRef<HTMLCanvasElement>(null)
  const cacheRef = useRef<OuterEdgesCache | null>(null)
  cacheRef.current ??= createOuterEdgesCache()
  const labelCachesRef = useRef<LabelCaches | null>(null)
  labelCachesRef.current ??= createLabelCaches()
  const [data, setData] = useState<MapData | null>(null)

  // 지목 필터 가시 집합 — 렌더·히트테스트·라벨 세 경로가 같은 배열을 입력해 일관성 보장 (M-14).
  // parcels.json 재로드 없이 이미 구성된 data.parcels에서 가시성만 거른다.
  const visibleParcels = useMemo(() => {
    if (!data) return null
    const visibleIds = visibleParcelIds(jimokFilter, data.parcels)
    if (visibleIds.size === data.parcels.length) return data.parcels // 전체 선택 — 재배열 회피
    return data.parcels.filter((p) => visibleIds.has(p.id))
  }, [data, jimokFilter])

  const { viewport, zoomBy } = useGestures({
    containerRef,
    aspect: data?.aspect ?? null,
    onTap: (point) => {
      // 필터로 가려진 필지는 탭 대상에서 제외 (가시 집합으로 히트테스트)
      if (visibleParcels) onParcelTap?.(hitTest(visibleParcels, point))
    },
  })

  const parcelToGroup = useMemo(() => {
    const map: Record<string, string> = {}
    for (const [gid, g] of Object.entries(groups)) {
      for (const pid of g.parcelIds) map[pid] = gid
    }
    return map
  }, [groups])

  useEffect(() => {
    let cancelled = false
    fetch('/data/parcels.json')
      .then((r) => r.json() as Promise<RawData>)
      .then((d) => {
        if (cancelled) return
        const proj = makeProjector(d.bbox)
        const parcels = d.parcels.map((p): EngineParcel => {
          const poly = p.c.map(([lng, lat]) => proj.project(lng, lat))
          // 라벨 앵커(센트로이드)·표시 게이트(bbox) 입력은 로드 시 1회 계산 (M-4)
          const [cx, cy] = polyCentroid(poly)
          let minX = Infinity
          let maxX = -Infinity
          let minY = Infinity
          let maxY = -Infinity
          for (const [x, y] of poly) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
          return {
            id: p.id,
            jibun: p.jibun,
            poly,
            area: polyArea(poly),
            cx,
            cy,
            bw: maxX - minX,
            bh: maxY - minY,
          }
        })
        // 면적 내림차순 — 작은 필지가 위에 그려지도록 (엔진·히트테스트 입력 계약)
        parcels.sort((a, b) => b.area - a.area)
        setData({ aspect: proj.aspect, parcels })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 리사이즈는 useGestures의 fit 리셋이 viewport를 갱신해 재진입한다
  useEffect(() => {
    const cv = canvasRef.current
    const lcv = labelCanvasRef.current
    const ct = containerRef.current
    const cache = cacheRef.current
    const labelCaches = labelCachesRef.current
    if (!cv || !lcv || !ct || !data || !visibleParcels || !cache || !labelCaches || !viewport) return
    const ctx = cv.getContext('2d')
    const lctx = lcv.getContext('2d')
    if (!ctx || !lctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const r = ct.getBoundingClientRect()
    // 캔버스 크기는 런타임 계산 값이라 직접 지정 (CONVENTIONS §4 예외)
    for (const canvas of [cv, lcv]) {
      canvas.width = Math.round(r.width * dpr)
      canvas.height = Math.round(r.height * dpr)
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
    }

    const scene = {
      aspect: data.aspect,
      // 지목 필터 가시 집합 — 렌더·라벨이 동일 배열 사용 (가려진 필지는 미표시·라벨 없음)
      parcels: visibleParcels,
      overrides,
      groups,
      parcelToGroup,
      colorById,
      viewport,
      selection,
    }
    const size = { width: r.width, height: r.height, dpr }
    renderScene(ctx, scene, size, cache)
    // 라벨은 같은 씬·같은 프레임에 별도 캔버스로 (v1 라벨 레이어 보존)
    renderLabels(lctx, scene, size, labelCaches)
  }, [data, visibleParcels, viewport, overrides, groups, parcelToGroup, colorById, selection])

  return (
    <div className="relative h-full w-full bg-surface-alt">
      {/* touch-none: 브라우저 기본 스크롤/줌 차단 — v1 touchmove preventDefault의 대체 */}
      <div ref={containerRef} className="absolute inset-0 touch-none">
        <canvas ref={canvasRef} className="block" />
        {/* 라벨 캔버스 — 메인 위 z-order. pointer-events 통과로 탭/팬/줌(M-3) 불변 */}
        <canvas ref={labelCanvasRef} className="pointer-events-none absolute top-0 left-0" />
      </div>
      {/* 줌 컨트롤 — 제스처 컨테이너의 형제라 pointerdown이 제스처로 새지 않는다 */}
      <div className="absolute right-3 bottom-8 z-10 flex flex-col overflow-hidden rounded-md bg-surface shadow-md">
        <IconButton icon={Plus} aria-label="확대" onClick={() => zoomBy(BUTTON_ZOOM_FACTOR)} />
        <div className="h-px bg-border" aria-hidden />
        <IconButton icon={Minus} aria-label="축소" onClick={() => zoomBy(1 / BUTTON_ZOOM_FACTOR)} />
      </div>
    </div>
  )
}
