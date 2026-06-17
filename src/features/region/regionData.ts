// 활성 region → 지도 데이터 정적 자산 경로 해석 (명세 절충 3: 렌더 입력은 정적 자산 1차 소스).
// DB가 아니라 public/data/ 정적 JSON에서 좌표를 1차 로딩한다 — 4천+ 폴리곤을 매 진입 API로
// 내려받는 비용 회피. 순수 함수라 단위 테스트로 경로 규칙을 고정한다.

import { SEED_REGION } from './regionCatalog'

/**
 * region id → parcels JSON 정적 자산 경로.
 * 보구곶(SEED_REGION)은 정확히 기존 parcels.json — 슬라이스 1 동작 보존(AC-5).
 * 그 외 region은 backend-dev가 적재하는 `/data/regions/<id>.json` (AC-6).
 * 구조는 둘 다 `{ bbox, parcels:[{id,jibun,c}] }` 동일.
 */
export function regionDataUrl(regionId: string): string {
  if (regionId === SEED_REGION.id) return '/data/parcels.json'
  return `/data/regions/${encodeURIComponent(regionId)}.json`
}
