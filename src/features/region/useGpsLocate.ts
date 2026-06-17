import { useCallback, useState } from 'react'
import { SEED_REGION, type Region } from './regionCatalog'

/**
 * GPS 진입 동선 상태 (AC-7).
 * - idle: 미요청
 * - locating: 권한·좌표 대기 중
 * - matched: 좌표 확보 — 추천 region 제시 (역지오코딩 백엔드는 비범위라 시드 region으로 폴백)
 * - denied: 권한 거부 / 미지원 — 폴백 안내 표시, 검색 경로는 계속 사용 가능
 */
export type GpsStatus = 'idle' | 'locating' | 'matched' | 'denied'

export interface GpsLocateState {
  status: GpsStatus
  /** 좌표 확보 시 추천할 region (역지오코딩 비범위 — 시드 region 고정 폴백) */
  matchedRegion: Region | null
  locate: () => void
  reset: () => void
}

/**
 * 위치 권한 분기·폴백만 검증 (명세 §AC-7 — 실제 좌표→행정구역 변환 없음).
 * 권한 거부·미지원·타임아웃 전부 'denied'로 수렴해 검색 폴백을 안내한다.
 */
export function useGpsLocate(): GpsLocateState {
  const [status, setStatus] = useState<GpsStatus>('idle')
  const [matchedRegion, setMatchedRegion] = useState<Region | null>(null)

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('denied')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      () => {
        // 좌표→행정구역 변환은 비범위 — 시드 region을 추천으로 제시한다
        setMatchedRegion(SEED_REGION)
        setStatus('matched')
      },
      () => {
        setStatus('denied')
      },
      { timeout: 8000, maximumAge: 60000 },
    )
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setMatchedRegion(null)
  }, [])

  return { status, matchedRegion, locate, reset }
}
