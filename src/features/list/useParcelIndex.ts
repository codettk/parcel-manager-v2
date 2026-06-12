import { useEffect, useState } from 'react'
import type { ParcelIndexEntry } from './listQuery'

interface RawParcelData {
  parcels: { id: string; jibun: string }[]
}

// 정적 지오데이터 모듈 캐시 — 목록 재진입 시 재로드 없음 (MapCanvas와 별도: 목록은 id·jibun만 사용)
let cache: ParcelIndexEntry[] | null = null
let inflight: Promise<ParcelIndexEntry[]> | null = null

async function load(): Promise<ParcelIndexEntry[]> {
  // 정적 자산이라 typed client(/api 전용) 비대상 — MapCanvas와 동일 경로 (CONVENTIONS §5 범위 밖)
  const res = await fetch('/data/parcels.json')
  const data = (await res.json()) as RawParcelData
  return data.parcels.map((p) => ({ id: p.id, jibun: p.jibun }))
}

/** null = 로드 전. 실패 시 캐시하지 않아 다음 진입에 재시도한다 */
export function useParcelIndex(): ParcelIndexEntry[] | null {
  const [index, setIndex] = useState(cache)

  useEffect(() => {
    if (cache !== null) return
    let cancelled = false
    inflight ??= load()
    inflight
      .then((parcels) => {
        cache = parcels
        if (!cancelled) setIndex(parcels)
      })
      .catch((err: unknown) => {
        inflight = null
        if (import.meta.env.DEV) console.error('[list] parcels.json 로드 실패:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return index
}

/** 테스트 전용 — 모듈 캐시 초기화 */
export function resetParcelIndexCache(): void {
  cache = null
  inflight = null
}
