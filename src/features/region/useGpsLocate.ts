import { useCallback, useState } from 'react'
import { ApiError, api } from '../../lib/api'
import { matchRegion } from './matchRegion'
import type { Region } from './regionCatalog'

/**
 * GPS 진입 동선 상태 머신 (명세 §GPS 동선 — 매칭 3분기 + 권한/에러 분기, 디자인 jCFcq 6상태).
 * - idle: 미요청
 * - locating: 권한·좌표 대기 (S1 탐색중)
 * - matched: 좌표→역지오코딩→카탈로그 매칭 성공. `region.loaded`로 적재(S2)·준비중(S3) 분기 (AC-9·10)
 * - no-match: 역지오코딩 성공·카탈로그 무매칭 (S4 검색 폴백 — 보구곶 자동 추천 없음, AC-11/절충 5)
 * - permission-denied: 위치 권한 거부 (S5 검색 폴백, AC-12)
 * - unsupported: geolocation 미지원 (S5 — 권한 거부와 동급 안내)
 * - geocode-error: 역지오코딩 프록시 503(키 부재)/502(외부 실패) (S6 실패 안내·검색 폴백, AC-13)
 *
 * 권한 분기는 역지오코딩 호출 이전에 일어난다(AC-12 — 권한 거부 시 외부 호출 없음).
 * 모든 실패 분기에서 앱은 중단되지 않고 검색 폴백이 항상 가능하다(절충 1·5).
 */
export type GpsStatus =
  | 'idle'
  | 'locating'
  | 'matched'
  | 'no-match'
  | 'permission-denied'
  | 'unsupported'
  | 'geocode-error'

export interface GpsLocateState {
  status: GpsStatus
  /** 'matched'일 때만 채워지는 추천 region (적재 여부는 region.loaded로 분기) */
  matchedRegion: Region | null
  /** 좌표를 얻어 역지오코딩 → 카탈로그 매칭 시도. 카탈로그는 호출 시점 인자로 주입(테스트 용이) */
  locate: () => void
  reset: () => void
}

/**
 * navigator.geolocation으로 좌표 획득 → `api.geocode.reverse` → `matchRegion`으로 카탈로그 매칭.
 * 카탈로그는 인자로 받는다(RegionSelectView가 이미 구독 중인 catalog를 넘김 — store 직접 의존 회피).
 * "항상 보구곶 추천" 폴백은 제거(절충 5) — 무매칭/에러는 정직하게 검색 폴백으로 수렴한다.
 */
export function useGpsLocate(catalog: readonly Region[]): GpsLocateState {
  const [status, setStatus] = useState<GpsStatus>('idle')
  const [matchedRegion, setMatchedRegion] = useState<Region | null>(null)

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }
    setStatus('locating')
    setMatchedRegion(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude, latitude } = position.coords
        api.geocode
          .reverse({ lng: longitude, lat: latitude })
          .then((res) => {
            if (res.area === null) {
              // 좌표는 유효하나 행정구역 미확정(AC-5) → 무매칭과 동일하게 검색 폴백(분기③)
              setStatus('no-match')
              return
            }
            const region = matchRegion(res.area, catalog)
            if (region === null) {
              setStatus('no-match')
              return
            }
            setMatchedRegion(region)
            setStatus('matched')
          })
          .catch((err: unknown) => {
            // 503(키 부재)·502(외부 실패)·기타 — 실패 안내 + 검색 폴백(AC-13, 보구곶 자동 추천 없음)
            if (import.meta.env.DEV && !(err instanceof ApiError)) {
              console.error('[gps] 역지오코딩 실패:', err)
            }
            setStatus('geocode-error')
          })
      },
      () => {
        // 권한 거부·타임아웃·위치 불가 — 전부 권한 분기로 수렴(검색 폴백 항상 가능, AC-12 슬라이스 1 회귀)
        setStatus('permission-denied')
      },
      { timeout: 8000, maximumAge: 60000 },
    )
  }, [catalog])

  const reset = useCallback(() => {
    setStatus('idle')
    setMatchedRegion(null)
  }, [])

  return { status, matchedRegion, locate, reset }
}
