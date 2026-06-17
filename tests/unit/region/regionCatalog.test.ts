import { describe, expect, it } from 'vitest'
// 명세: docs/specs/national-data-pipeline.md — 카탈로그 순수 로직(searchRegions·loadedRegions·분류).
// 슬라이스 3에서 카탈로그는 서버 권위가 됐다 — 순수 로직은 카탈로그 배열을 인자로 받아 동작한다.
import {
  SEED_CATALOG,
  SEED_REGION,
  getRegionById,
  loadedRegions,
  lookupRegion,
  searchRegions,
  type Region,
} from '../../../src/features/region/regionCatalog'

describe('regionCatalog — 시드 카탈로그', () => {
  it('보구곶(인천 강화군 화도면)이 적재(loaded) 기준 region이다', () => {
    expect(SEED_REGION.loaded).toBe(true)
    expect(SEED_REGION.sido).toBe('인천광역시')
    expect(SEED_REGION.sigungu).toBe('강화군')
    expect(SEED_REGION.emd).toBe('화도면')
    expect(SEED_REGION.sortOrder).toBe(0)
  })

  it('표시명에 "보구곶"이 region 데이터로 유지된다 (브랜드 문구 아님)', () => {
    expect(SEED_REGION.displayName).toContain('보구곶')
  })

  it('샘플 region(경기 김포 대곶면)이 시드에서 loaded:true로 승격됐다', () => {
    const daegot = SEED_CATALOG.find((r) => r.id === 'gyeonggi-gimpo-daegot')
    expect(daegot?.loaded).toBe(true)
  })
})

describe('searchRegions — 행정구역 검색', () => {
  it('"화도" 검색 시 보구곶 region이 적재됨(loaded)으로 매칭된다', () => {
    const results = searchRegions(SEED_CATALOG, '화도')
    const seed = results.find((r) => r.id === SEED_REGION.id)
    expect(seed).toBeDefined()
    expect(seed?.loaded).toBe(true)
  })

  it('공백·대소문자를 무시하고 시/군구로도 매칭된다', () => {
    expect(searchRegions(SEED_CATALOG, ' 강화 ').length).toBeGreaterThan(0)
    expect(searchRegions(SEED_CATALOG, '화도').some((r) => r.id === SEED_REGION.id)).toBe(true)
  })

  it('빈 질의는 전체 카탈로그를 sortOrder 순으로 반환한다', () => {
    const all = searchRegions(SEED_CATALOG, '')
    expect(all.length).toBe(SEED_CATALOG.length)
    expect(all.map((r) => r.sortOrder)).toEqual([...all.map((r) => r.sortOrder)].sort((a, b) => a - b))
    expect(searchRegions(SEED_CATALOG, '   ').length).toBe(SEED_CATALOG.length)
  })

  it('매칭 없는 질의는 빈 배열', () => {
    expect(searchRegions(SEED_CATALOG, '존재하지않는지역명xyz')).toEqual([])
  })

  it('준비 중 행정구역도 검색 결과에 노출되되 loaded:false다', () => {
    const gilsang = searchRegions(SEED_CATALOG, '길상').find((r) => r.emd === '길상면')
    expect(gilsang).toBeDefined()
    expect(gilsang?.loaded).toBe(false)
  })
})

describe('lookupRegion / getRegionById', () => {
  it('시드 getRegionById — 존재하는 id는 region, 없는 id는 undefined', () => {
    expect(getRegionById(SEED_REGION.id)?.id).toBe(SEED_REGION.id)
    expect(getRegionById('없는-id')).toBeUndefined()
  })

  it('lookupRegion은 임의 카탈로그 배열에서 id를 조회한다', () => {
    const custom: Region[] = [{ ...SEED_REGION, id: 'x-only', displayName: 'X' }]
    expect(lookupRegion(custom, 'x-only')?.displayName).toBe('X')
    expect(lookupRegion(custom, SEED_REGION.id)).toBeUndefined()
  })
})

describe('loadedRegions — 적재 region 분류 (AC-2)', () => {
  it('적재 region만 반환하고 보구곶이 포함된다', () => {
    const loaded = loadedRegions(SEED_CATALOG)
    expect(loaded.every((r) => r.loaded)).toBe(true)
    expect(loaded.some((r) => r.id === SEED_REGION.id)).toBe(true)
  })

  it('적재/준비중 분류가 카탈로그 loaded 플래그와 1:1 일치한다 (AC-2)', () => {
    const loaded = loadedRegions(SEED_CATALOG)
    const upcoming = SEED_CATALOG.filter((r) => !r.loaded)
    expect(loaded.length + upcoming.length).toBe(SEED_CATALOG.length)
    expect(loaded.length).toBe(SEED_CATALOG.filter((r) => r.loaded).length)
  })
})
