import { useEffect } from 'react'
import { useRegionsStore } from '../../stores/regions'
import type { Region } from './regionCatalog'

let bootRequested = false

/**
 * region 카탈로그 + 받은 목록 부팅 — 첫 마운트 1회 `GET /api/regions`·`GET /api/regions/mine` 조회.
 * 실패 시 스토어가 SEED 폴백을 유지한다 (명세 절충 4). 모듈 가드로 뷰 재마운트에도 1회만 호출.
 * 반환은 스토어 카탈로그(서버 응답 또는 폴백) + 로드 완료 플래그.
 */
export function useRegionCatalog(): { catalog: Region[]; loaded: boolean } {
  const catalog = useRegionsStore((s) => s.catalog)
  const loaded = useRegionsStore((s) => s.catalogLoaded)

  useEffect(() => {
    if (bootRequested) return
    bootRequested = true
    const { loadCatalog, loadMine } = useRegionsStore.getState()
    void loadCatalog()
    void loadMine()
  }, [])

  return { catalog, loaded }
}

/** 테스트 격리용 — 부팅 1회 가드 해제 */
export function resetRegionCatalogBootForTest(): void {
  bootRequested = false
}
