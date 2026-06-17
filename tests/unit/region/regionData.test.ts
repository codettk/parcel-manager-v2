import { describe, expect, it } from 'vitest'
// 명세: docs/specs/national-data-pipeline.md AC-5(보구곶 회귀)·6(region 단위 교체).
import { regionDataUrl } from '../../../src/features/region/regionData'
import { SEED_REGION } from '../../../src/features/region/regionCatalog'

describe('regionDataUrl — 활성 region → 지도 데이터 경로 해석', () => {
  it('보구곶(SEED_REGION)은 정확히 기존 parcels.json (AC-5 회귀 보존)', () => {
    expect(regionDataUrl(SEED_REGION.id)).toBe('/data/parcels.json')
  })

  it('그 외 region은 /data/regions/<id>.json (AC-6)', () => {
    expect(regionDataUrl('gyeonggi-gimpo-daegot')).toBe('/data/regions/gyeonggi-gimpo-daegot.json')
  })

  it('경로 분절 문자가 든 id는 인코딩된다 (정적 자산 경로 안전)', () => {
    expect(regionDataUrl('a/b c')).toBe('/data/regions/a%2Fb%20c.json')
  })
})
