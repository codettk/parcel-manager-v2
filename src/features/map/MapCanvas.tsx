// Phase 0-7 스파이크 — 필지 폴리곤 1차 렌더 확인용.
// 본 렌더 엔진(8-pass, 제스처, 라벨)은 M-2~M-4에서 features/map/engine/으로 구현한다.
import { useEffect, useRef, useState } from 'react'
import { makeProjector, polyArea, type Bbox, type Point } from '../../utils/geo'
import { CANVAS_COLORS } from './engine/colors'

interface RawParcel {
  id: string
  jibun: string
  c: [number, number][]
}

interface RawData {
  bbox: Bbox
  parcels: RawParcel[]
}

interface Parcel {
  id: string
  jibun: string
  poly: Point[]
  area: number
}

interface MapData {
  aspect: number
  parcels: Parcel[]
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [data, setData] = useState<MapData | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/data/parcels.json')
      .then((r) => r.json() as Promise<RawData>)
      .then((d) => {
        if (cancelled) return
        const proj = makeProjector(d.bbox)
        const parcels = d.parcels.map((p) => {
          const poly = p.c.map(([lng, lat]) => proj.project(lng, lat))
          return { id: p.id, jibun: p.jibun, poly, area: polyArea(poly) }
        })
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
    if (!cv || !ct || !data) return

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = ct.getBoundingClientRect()
      cv.width = Math.round(r.width * dpr)
      cv.height = Math.round(r.height * dpr)
      cv.style.width = `${r.width}px`
      cv.style.height = `${r.height}px`

      const containerAspect = r.width / r.height
      let scale = containerAspect > data.aspect ? r.height : r.width / data.aspect
      scale *= 0.94
      const dataW = data.aspect * scale
      const dataH = scale
      const tx = (r.width - dataW) / 2
      const ty = (r.height - dataH) / 2

      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, r.width, r.height)
      ctx.fillStyle = CANVAS_COLORS.surface
      ctx.strokeStyle = CANVAS_COLORS.parcelBorder
      ctx.lineWidth = 0.5

      for (const p of data.parcels) {
        ctx.beginPath()
        for (let i = 0; i < p.poly.length; i++) {
          const [x, y] = p.poly[i]
          const px = tx + x * dataW
          const py = ty + y * dataH
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(ct)
    return () => observer.disconnect()
  }, [data])

  return (
    <div ref={containerRef} className="h-full w-full bg-surface-alt">
      <canvas ref={canvasRef} />
    </div>
  )
}
