import type { AdminArea } from '../../types/api/geocode'
import type { Region } from './regionCatalog'

/**
 * 행정구역 명칭 정규화 — 공백 제거(searchRegions의 `replace(/\s+/g, '')`와 동형).
 * 역지오코딩 결과("강 화 군" 등 공백 변형)와 카탈로그를 같은 규칙으로 비교하기 위함.
 */
function normalize(name: string): string {
  return name.replace(/\s+/g, '')
}

/**
 * 역지오코딩 행정구역 → region 카탈로그 매칭 (명세 §AC-6·7·8, 절충 2·5).
 *
 * - **sido·sigungu·emd 정확 일치**(공백 정규화 후). 읍면동(emd) 단위 — 시군구 단위 폴백은 이번 범위 밖.
 * - 매칭은 `loaded` 여부와 무관(AC-7) — 적재/준비중 분기는 호출부가 한다.
 * - 무매칭이면 `null`(AC-8). **시드 region(보구곶)을 폴백으로 반환하지 않는다**(절충 5 — 무매칭은 정직하게).
 */
export function matchRegion(area: AdminArea, catalog: readonly Region[]): Region | null {
  const sido = normalize(area.sido)
  const sigungu = normalize(area.sigungu)
  const emd = normalize(area.emd)
  return (
    catalog.find(
      (r) =>
        normalize(r.sido) === sido &&
        normalize(r.sigungu) === sigungu &&
        normalize(r.emd) === emd,
    ) ?? null
  )
}
