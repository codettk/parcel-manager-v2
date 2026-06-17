import { create } from 'zustand'
import { SEED_CATALOG, type Region } from '../features/region/regionCatalog'
import { ApiError, api } from '../lib/api'

/** 마지막 활성 region 영속 키 (src/stores/ui.ts ACTIVE_REGION_STORAGE_KEY와 동일) — 받은 목록 보강용 */
const ACTIVE_REGION_STORAGE_KEY = 'pilji_v2_active_region'

/** 받기 진행 상태 — RegionRow가 "받는 중…"(낙관)·완료를 구분해 렌더한다 (디자인 zfSwy d·e) */
export type AcquireStatus = 'idle' | 'acquiring'

export interface RegionsState {
  /**
   * 전역 공개 카탈로그 — 서버(`GET /api/regions`)가 단일 진실. 부팅 전/실패 시 SEED_CATALOG 폴백.
   * loaded 분류(적재 vs 준비 중)는 이 배열에서 파생한다 (AC-2).
   */
  catalog: Region[]
  /** 카탈로그 로드 완료 여부 — false면 폴백 시드를 보고 있을 수 있다 (부팅 1회 캐시) */
  catalogLoaded: boolean
  /** 사용자가 받은 region id 집합 — 서버(`GET /api/regions/mine`) 동기화 + 낙관적 받기/제거 */
  acquiredIds: string[]
  /** 받기 진행 중인 region id (낙관적 추가 직후~서버 응답 전) — 하나만 진행한다고 가정 */
  acquiring: string | null
  /** 카탈로그 로드 (부팅 1회) — 실패 시 SEED_CATALOG 폴백 (인증 불요·공개) */
  loadCatalog: () => Promise<void>
  /** 받은 목록 로드 (로그인 사용자) — 실패 시 기존 acquiredIds 유지(로컬 폴백, 명세 절충 4) */
  loadMine: () => Promise<void>
  /**
   * 받기 (AC-7·12) — 낙관적 추가 후 POST. loaded=false면 시도하지 않고 false 반환(호출부 토스트, AC-8·17).
   * 성공/실패 모두 acquiredIds는 유지(낙관 패턴, 롤백 없음). 이미 받았으면 즉시 true.
   */
  acquire: (regionId: string) => Promise<boolean>
  /** 제거 (AC-9·13) — 낙관적 제거 후 DELETE. 실패 시 롤백 없음(upsertParcel 동형) */
  remove: (regionId: string) => void
  /** 받은 적 있는지 — RegionRow 상태(받음 vs 받기 가능) 분기 (순수 조회) */
  isAcquired: (regionId: string) => boolean
}

export const useRegionsStore = create<RegionsState>()((set, get) => ({
  catalog: [...SEED_CATALOG],
  catalogLoaded: false,
  acquiredIds: [],
  acquiring: null,

  loadCatalog: async () => {
    try {
      const catalog = await api.regions.list()
      set({ catalog, catalogLoaded: true })
    } catch (err) {
      // 카탈로그는 공개라 실패해도 시드 폴백으로 진입 게이트가 동작해야 한다 (명세 절충 4)
      if (import.meta.env.DEV) console.warn('[regions] 카탈로그 로드 실패 — 시드 폴백:', err)
      set({ catalogLoaded: true })
    }
  },

  loadMine: async () => {
    // 활성 region은 항상 받은 목록에 있어야 한다(AC-16 새로고침 직행 후 관리 화면 일관) — 서버 응답에 병합
    const active = localStorage.getItem(ACTIVE_REGION_STORAGE_KEY)
    try {
      const mine = await api.regions.mine()
      const ids = mine.map((r) => r.regionId)
      if (active !== null && !ids.includes(active)) ids.push(active)
      set({ acquiredIds: ids })
    } catch (err) {
      // 서버 비응답/무인증 — 로컬 폴백(기존 acquiredIds + 활성 region 유지). 진입 게이트는 localStorage가 권위
      if (import.meta.env.DEV) console.warn('[regions] 받은 목록 로드 실패 — 로컬 유지:', err)
      if (active !== null && !get().acquiredIds.includes(active)) {
        set({ acquiredIds: [...get().acquiredIds, active] })
      }
    }
  },

  acquire: async (regionId) => {
    const { catalog, acquiredIds } = get()
    const region = catalog.find((r) => r.id === regionId)
    if (region === undefined || !region.loaded) return false // 준비 중 — 받기 불가 (AC-8·17)
    if (acquiredIds.includes(regionId)) return true // 멱등 — 이미 받음
    // 낙관적 추가 + 진행 표시 (디자인 d "받는 중…")
    set({ acquiredIds: [...acquiredIds, regionId], acquiring: regionId })
    try {
      await api.regions.acquire(regionId)
      return true
    } catch (err) {
      // 409(준비 중 서버 판정)는 클라 가드를 뚫고 온 경우 — 낙관 추가를 되돌린다
      if (err instanceof ApiError && err.status === 409) {
        set({ acquiredIds: get().acquiredIds.filter((id) => id !== regionId) })
        return false
      }
      // 그 외 실패는 낙관 유지(롤백 없음 — M-5 패턴). 다음 loadMine이 서버와 정합
      if (import.meta.env.DEV) console.error('[regions] 받기 실패:', err)
      return true
    } finally {
      if (get().acquiring === regionId) set({ acquiring: null })
    }
  },

  remove: (regionId) => {
    set({ acquiredIds: get().acquiredIds.filter((id) => id !== regionId) })
    api.regions.remove(regionId).catch((err: unknown) => {
      console.error('[regions] 제거 실패:', err)
    })
  },

  isAcquired: (regionId) => get().acquiredIds.includes(regionId),
}))
