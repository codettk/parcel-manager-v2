// region 카탈로그 — 전국 지적도 진입 추상화의 클라이언트 메타.
// 슬라이스 3에서 서버 권위(`GET /api/regions`)로 승격됐다 — 이 모듈은 더 이상 단일 진실이 아니라
// ① `Region` 타입(계약 `src/types/api/regions.ts`에서 추론) ② 순수 분류/검색 로직
// ③ 서버 미응답 시 부팅 시드/폴백 상수(SEED_CATALOG)만 책임진다.
// 카탈로그 조회·캐시는 useRegionCatalog, 지도 데이터 경로 해석은 regionData가 맡는다.

// 계약을 단일 진실로 — Region 타입은 zod 추론을 재노출한다 (현재 sortOrder 포함).
export type { Region } from '../../types/api/regions'
import type { Region } from '../../types/api/regions'

/**
 * 유일하게 데이터가 적재된 기준 region — 보구곶리(인천 강화군 화도면).
 * "보구곶"은 브랜드 문구가 아니라 이 region의 표시명 일부로만 유지한다 (리브랜딩 단서).
 * id는 영속 키(localStorage)·parcels.region_id — 변경 금지.
 */
export const SEED_REGION: Region = {
  id: 'incheon-ganghwa-hwado',
  sido: '인천광역시',
  sigungu: '강화군',
  emd: '화도면',
  displayName: '인천 강화군 화도면(보구곶)',
  shortName: '화도면(보구곶)',
  loaded: true,
  parcelCount: 4409,
  sizeLabel: '4.2MB',
  sortOrder: 0,
}

/**
 * 부팅 시드/폴백 카탈로그 — `GET /api/regions` 실패 시 useRegionCatalog가 이걸로 폴백한다.
 * 슬라이스 3 시연 데이터셋(gyeonggi-gimpo-daegot)을 loaded:true로 둔다 — 서버 카탈로그도 동형이라
 * 서버 응답/폴백 어느 쪽이든 같은 적재 분류를 본다.
 */
export const SEED_CATALOG: readonly Region[] = [
  SEED_REGION,
  {
    id: 'gyeonggi-gimpo-daegot',
    sido: '경기도',
    sigungu: '김포시',
    emd: '대곶면',
    displayName: '경기 김포시 대곶면',
    shortName: '대곶면',
    loaded: true,
    parcelCount: 2980,
    sizeLabel: '9.1MB',
    sortOrder: 1,
  },
  {
    id: 'incheon-ganghwa-ganghwa',
    sido: '인천광역시',
    sigungu: '강화군',
    emd: '강화읍',
    displayName: '인천 강화군 강화읍',
    shortName: '강화읍',
    loaded: false,
    parcelCount: 3180,
    sizeLabel: '9.1MB',
    sortOrder: 2,
  },
  {
    id: 'incheon-ganghwa-gilsang',
    sido: '인천광역시',
    sigungu: '강화군',
    emd: '길상면',
    displayName: '인천 강화군 길상면',
    shortName: '길상면',
    loaded: false,
    parcelCount: 2070,
    sizeLabel: '6.4MB',
    sortOrder: 3,
  },
  {
    id: 'jeonnam-haenam-sani',
    sido: '전라남도',
    sigungu: '해남군',
    emd: '산이면',
    displayName: '전남 해남군 산이면',
    shortName: '산이면',
    loaded: false,
    parcelCount: 4120,
    sizeLabel: '12.4MB',
    sortOrder: 4,
  },
] as const

/**
 * @deprecated SEED_CATALOG로 대체 — 서버 카탈로그가 단일 진실이다.
 * getRegionById의 동기 폴백(스토어 selectRegion 검증)에서만 시드 조회로 남겨둔다.
 */
export const REGION_CATALOG = SEED_CATALOG

/**
 * 시드 카탈로그에서 id 조회 — 서버 카탈로그가 비었거나(부팅 전) 폴백일 때의 동기 조회.
 * 런타임 카탈로그 조회는 lookupRegion(catalog, id)를 쓴다 (서버 응답 위에서 동작).
 */
export function getRegionById(id: string): Region | undefined {
  return SEED_CATALOG.find((r) => r.id === id)
}

/** 임의의 카탈로그 배열에서 id 조회 — 서버 응답/시드 모두에 동작 (순수) */
export function lookupRegion(catalog: readonly Region[], id: string): Region | undefined {
  return catalog.find((r) => r.id === id)
}

/**
 * 검색 — 시/군구/읍면동/표시명에 질의 문자열이 포함되면 매칭 (대소문자·공백 무시).
 * 빈 질의는 sortOrder 정렬 전체를 반환. 서버 카탈로그 배열 위에서 동작하도록 인자화 (순수).
 */
export function searchRegions(catalog: readonly Region[], query: string): Region[] {
  const sorted = [...catalog].sort((a, b) => a.sortOrder - b.sortOrder)
  const q = query.trim().replace(/\s+/g, '')
  if (q === '') return sorted
  return sorted.filter((r) =>
    [r.sido, r.sigungu, r.emd, r.displayName, r.shortName].some((field) =>
      field.replace(/\s+/g, '').includes(q),
    ),
  )
}

/** 데이터 적재된 region 목록 — sortOrder 순. "준비 중"(loaded=false)은 제외 (순수) */
export function loadedRegions(catalog: readonly Region[]): Region[] {
  return [...catalog].filter((r) => r.loaded).sort((a, b) => a.sortOrder - b.sortOrder)
}
