import type { Region } from './regionCatalog'

/**
 * RegionRow 상태 (디자인 new-design-v3.pen 프레임 zfSwy A. 상태 카탈로그):
 * - active: 받음·사용 중 (강조 테두리 + 체크)
 * - acquired: 받음·비활성 (⋮ 더보기 — 제거 진입, 관리 화면)
 * - available: 받기 가능 (적재됐고 미보유 — 받기 CTA)
 * - acquiring: 받는 중 (낙관적 진행 스피너)
 * - upcoming: 준비 중 (loaded=false — dimmed + 준비중 배지)
 */
export type RegionRowState = 'active' | 'acquired' | 'available' | 'acquiring' | 'upcoming'

/** region + 스토어 상태로 RegionRowState 도출 (선택·관리 공용 순수 분류) */
export function deriveRegionRowState(
  region: Region,
  ctx: { activeRegionId: string | null; acquired: boolean; acquiring: boolean },
): RegionRowState {
  if (region.id === ctx.activeRegionId) return 'active'
  if (!region.loaded) return 'upcoming'
  if (ctx.acquiring) return 'acquiring'
  if (ctx.acquired) return 'acquired'
  return 'available'
}
