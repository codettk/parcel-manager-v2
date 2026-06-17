import { describe, expect, it } from 'vitest'
// 명세: docs/specs/gps-geocoding.md §AC-6·7·8 — 역지오코딩 행정구역 → region 카탈로그 매칭 순수 규칙.
import { matchRegion } from '../../../src/features/region/matchRegion'
import { SEED_CATALOG, SEED_REGION, type Region } from '../../../src/features/region/regionCatalog'
import type { AdminArea } from '../../../src/types/api/geocode'

const UPCOMING = SEED_CATALOG.find((r) => !r.loaded)
if (UPCOMING === undefined) throw new Error('SEED_CATALOG에 준비중 region이 없음 (테스트 전제)')

describe('matchRegion — 좌표 행정구역 → 카탈로그 (AC-6·7·8)', () => {
  it('AC-6 보구곶(loaded=true) 행정구역이 sido·sigungu·emd 정확 일치로 매칭된다', () => {
    const area: AdminArea = { sido: '인천광역시', sigungu: '강화군', emd: '화도면' }
    expect(matchRegion(area, SEED_CATALOG)?.id).toBe(SEED_REGION.id)
  })

  it('AC-6 공백 변형(searchRegions 동형 정규화)을 무시하고 매칭된다', () => {
    const area: AdminArea = { sido: '인천 광역시', sigungu: ' 강화군 ', emd: '화 도 면' }
    expect(matchRegion(area, SEED_CATALOG)?.id).toBe(SEED_REGION.id)
  })

  it('AC-7 준비중(loaded=false) region도 적재 여부와 무관하게 매칭된다', () => {
    const area: AdminArea = { sido: UPCOMING.sido, sigungu: UPCOMING.sigungu, emd: UPCOMING.emd }
    const matched = matchRegion(area, SEED_CATALOG)
    expect(matched?.id).toBe(UPCOMING.id)
    expect(matched?.loaded).toBe(false)
  })

  it('AC-8 카탈로그에 없는 행정구역은 null — 보구곶 폴백 없음(절충 5)', () => {
    const area: AdminArea = { sido: '서울특별시', sigungu: '종로구', emd: '청운동' }
    expect(matchRegion(area, SEED_CATALOG)).toBeNull()
  })

  it('emd 단위 정확 일치 — sido·sigungu가 같아도 emd가 다르면 null(시군구 폴백 없음, 절충 2)', () => {
    // 보구곶과 같은 인천 강화군이지만 emd만 다른 가상 행정구역
    const area: AdminArea = { sido: '인천광역시', sigungu: '강화군', emd: '없는면' }
    expect(matchRegion(area, SEED_CATALOG)).toBeNull()
  })

  it('빈 카탈로그는 항상 null', () => {
    const area: AdminArea = { sido: '인천광역시', sigungu: '강화군', emd: '화도면' }
    expect(matchRegion(area, [] as Region[])).toBeNull()
  })
})
