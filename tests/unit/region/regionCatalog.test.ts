import { describe, expect, it } from 'vitest'
// 명세: docs/specs/region-entry.md AC-5(검색 매칭)·AC-6(미적재 분류)·AC-11(받은 지역)
import {
  REGION_CATALOG,
  SEED_REGION,
  getRegionById,
  loadedRegions,
  searchRegions,
} from '../../../src/features/region/regionCatalog'

describe('regionCatalog — 시드 region', () => {
  it('보구곶(인천 강화군 화도면)이 유일하게 적재(loaded)된 region이다', () => {
    expect(SEED_REGION.loaded).toBe(true)
    expect(SEED_REGION.sido).toBe('인천광역시')
    expect(SEED_REGION.sigungu).toBe('강화군')
    expect(SEED_REGION.emd).toBe('화도면')
    const loadedCount = REGION_CATALOG.filter((r) => r.loaded).length
    expect(loadedCount).toBe(1)
  })

  it('표시명에 "보구곶"이 region 데이터로 유지된다 (브랜드 문구 아님)', () => {
    expect(SEED_REGION.displayName).toContain('보구곶')
  })
})

describe('searchRegions — 행정구역 검색 (AC-5)', () => {
  it('"화도" 검색 시 보구곶 region이 적재됨(loaded)으로 매칭된다', () => {
    const results = searchRegions('화도')
    const seed = results.find((r) => r.id === SEED_REGION.id)
    expect(seed).toBeDefined()
    expect(seed?.loaded).toBe(true)
  })

  it('공백·대소문자를 무시하고 시/군구로도 매칭된다', () => {
    expect(searchRegions(' 강화 ').length).toBeGreaterThan(0)
    expect(searchRegions('화도').some((r) => r.id === SEED_REGION.id)).toBe(true)
  })

  it('빈 질의는 전체 카탈로그를 반환한다', () => {
    expect(searchRegions('').length).toBe(REGION_CATALOG.length)
    expect(searchRegions('   ').length).toBe(REGION_CATALOG.length)
  })

  it('매칭 없는 질의는 빈 배열', () => {
    expect(searchRegions('존재하지않는지역명xyz')).toEqual([])
  })

  it('미적재 행정구역도 검색 결과에 노출되되 loaded:false다 (AC-6 분류)', () => {
    const daegot = searchRegions('대곶').find((r) => r.emd === '대곶면')
    expect(daegot).toBeDefined()
    expect(daegot?.loaded).toBe(false)
  })
})

describe('getRegionById', () => {
  it('존재하는 id는 region을, 없는 id는 undefined를 반환', () => {
    expect(getRegionById(SEED_REGION.id)?.id).toBe(SEED_REGION.id)
    expect(getRegionById('없는-id')).toBeUndefined()
  })
})

describe('loadedRegions — 받은 지역 (AC-11)', () => {
  it('적재 region만 반환하고 보구곶이 포함된다', () => {
    const loaded = loadedRegions()
    expect(loaded.every((r) => r.loaded)).toBe(true)
    expect(loaded.some((r) => r.id === SEED_REGION.id)).toBe(true)
  })
})
