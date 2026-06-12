import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { ParcelAreasResponse } from '../../types/api/parcels'

// 면적 일괄 조회 메모리 캐시 — 목록 최초 진입 1회 호출, 재진입 시 재호출 없음 (명세 §면적 데이터)
let cache: ParcelAreasResponse | null = null
let inflight: Promise<ParcelAreasResponse> | null = null

/** null = 미수신(로딩·실패) — 면적 컬럼은 '-' 표시하되 목록 자체는 동작한다 */
export function useParcelAreas(): ParcelAreasResponse | null {
  const [areas, setAreas] = useState(cache)

  useEffect(() => {
    if (cache !== null) return
    let cancelled = false
    inflight ??= api.parcels.listAreas()
    inflight
      .then((data) => {
        cache = data
        if (!cancelled) setAreas(data)
      })
      .catch((err: unknown) => {
        // 실패는 캐시하지 않음 — 다음 진입 시 재시도
        inflight = null
        if (import.meta.env.DEV) console.error('[list] 면적 일괄 조회 실패:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return areas
}

/** 테스트 전용 — 모듈 캐시 초기화 */
export function resetParcelAreasCache(): void {
  cache = null
  inflight = null
}
