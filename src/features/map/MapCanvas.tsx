// 얇은 React 호스트 — parcels.json 로드·캔버스/DPR/리사이즈 관리만 하고 렌더는 엔진에 위임.
// 씬 데이터(overrides/groups/selection)는 props 주입 — M-5 스토어 도입 전까지 App은 빈 값으로 구동.
import { useEffect, useMemo, useRef, useState } from 'react'
import { makeProjector, polyArea, type Bbox } from '../../utils/geo'
import type { Group, ParcelOverride } from '../../types/api/tabState'
import {
  EMPTY_SELECTION,
  MAX_DPR,
  computeFitViewport,
  createOuterEdgesCache,
  renderScene,
  type EngineParcel,
  type OuterEdgesCache,
  type SelectionState,
} from './engine'

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
}

const EMPTY_OVERRIDES: Record<string, ParcelOverride> = {}
const EMPTY_GROUPS: Record<string, Group> = {}
const EMPTY_COLOR_BY_ID: Record<string, string> = {}

export function MapCanvas({
  overrides = EMPTY_OVERRIDES,
  groups = EMPTY_GROUPS,
  colorById = EMPTY_COLOR_BY_ID,
  selection = EMPTY_SELECTION,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cacheRef = useRef<OuterEdgesCache | null>(null)
  cacheRef.current ??= createOuterEdgesCache()
  const [data, setData] = useState<MapData | null>(null)

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
          return { id: p.id, jibun: p.jibun, poly, area: polyArea(poly) }
        })
        // 면적 내림차순 — 작은 필지가 위에 그려지도록 (엔진 입력 계약)
        parcels.sort((a, b) => b.area - a.area)
        setData({ aspect: proj.aspect, parcels })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const cv = canvasRef.current
    const ct = containerRef.current
    const cache = cacheRef.current
    if (!cv || !ct || !data || !cache) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const r = ct.getBoundingClientRect()
      // 캔버스 크기는 런타임 계산 값이라 직접 지정 (CONVENTIONS §4 예외)
      cv.width = Math.round(r.width * dpr)
      cv.height = Math.round(r.height * dpr)
      cv.style.width = `${r.width}px`
      cv.style.height = `${r.height}px`

      // M-3(제스처) 전까지 뷰포트는 초기 fit 고정
      const viewport = computeFitViewport(data.aspect, r.width, r.height)
      renderScene(
        ctx,
        {
          aspect: data.aspect,
          parcels: data.parcels,
          overrides,
          groups,
          parcelToGroup,
          colorById,
          viewport,
          selection,
        },
        { width: r.width, height: r.height, dpr },
        cache,
      )
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(ct)
    return () => observer.disconnect()
  }, [data, overrides, groups, parcelToGroup, colorById, selection])

  return (
    <div ref={containerRef} className="h-full w-full bg-surface-alt">
      <canvas ref={canvasRef} />
    </div>
  )
}
