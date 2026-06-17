// region 카탈로그 — 전국 지적도 진입 추상화의 클라이언트 메타.
// 절충(명세 §배경): parcels.json은 단 하나(보구곶)만 적재된다. 그 외 region은 loaded:false("준비 중")로
// 목록·검색에 노출만 하고 지도로 진입시키지 않는다. 백엔드/DB/API 무변경 — 향후 다중 region 데이터
// 파이프라인이 도입되면 이 상수가 src/types/api/ region 스키마로 승격될 예정.

/** 한 행정구역 region 메타. id는 영속 키(localStorage)·식별자 — 변경 금지 */
export interface Region {
  id: string
  sido: string
  sigungu: string
  emd: string
  /** 목록·칩 표시명 (예: "인천 강화군 화도면") */
  displayName: string
  /** 칩 등 좁은 폭의 축약 표시명 (예: "강화군 화도면") */
  shortName: string
  /** 데이터(parcels.json) 적재 여부. false면 "준비 중" — 선택해도 지도 미전환 (AC-6) */
  loaded: boolean
  /** 필지 수 (표시용. 미적재 region은 추정치) */
  parcelCount: number
  /** 저장 용량 표기 (지역 관리 화면 메타) */
  sizeLabel: string
}

/**
 * 유일하게 데이터가 적재된 region — 보구곶리(인천 강화군 화도면).
 * "보구곶"은 브랜드 문구가 아니라 이 region의 표시명 일부로만 유지한다 (명세 리브랜딩 단서).
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
}

/** "준비 중" region — 검색·관리 목록에 노출되되 지도로 진입하지 않는다 (AC-6) */
const UPCOMING_REGIONS: readonly Region[] = [
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
  },
  {
    id: 'gyeonggi-gimpo-daegot',
    sido: '경기도',
    sigungu: '김포시',
    emd: '대곶면',
    displayName: '경기 김포시 대곶면',
    shortName: '대곶면',
    loaded: false,
    parcelCount: 2980,
    sizeLabel: '9.1MB',
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
  },
] as const

/** 전체 카탈로그 — 적재 region을 앞에 둔다 (검색·관리 정렬 기준) */
export const REGION_CATALOG: readonly Region[] = [SEED_REGION, ...UPCOMING_REGIONS]

export function getRegionById(id: string): Region | undefined {
  return REGION_CATALOG.find((r) => r.id === id)
}

/**
 * 검색 — 시/군구/읍면동/표시명에 질의 문자열이 포함되면 매칭 (대소문자·공백 무시).
 * "화도" → 보구곶 region이 활성으로 매칭된다 (AC-5). 빈 질의는 전체 카탈로그 반환.
 */
export function searchRegions(query: string): Region[] {
  const q = query.trim().replace(/\s+/g, '')
  if (q === '') return [...REGION_CATALOG]
  return REGION_CATALOG.filter((r) =>
    [r.sido, r.sigungu, r.emd, r.displayName, r.shortName]
      .some((field) => field.replace(/\s+/g, '').includes(q)),
  )
}

/** 데이터 적재(= "받은") region 목록 — 지역 관리 화면 소관 (AC-11) */
export function loadedRegions(): Region[] {
  return REGION_CATALOG.filter((r) => r.loaded)
}
