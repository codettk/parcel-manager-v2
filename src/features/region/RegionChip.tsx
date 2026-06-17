import { ChevronDown, MapPin } from 'lucide-react'
import { useRegionsStore } from '../../stores/regions'
import { useUiStore } from '../../stores/ui'
import { lookupRegion } from './regionCatalog'

/**
 * 지도 상단 현재 region 칩 — 탭 시 지역 선택 화면 재진입.
 * 서버 카탈로그(부팅 전/실패 시 시드 폴백)에서 활성 region을 조회한다.
 * region 미선택 시엔 게이트가 지도를 가리므로 렌더되지 않는다 (App 분기).
 */
export function RegionChip() {
  const activeRegionId = useUiStore((s) => s.activeRegionId)
  const openRegionSelect = useUiStore((s) => s.openRegionSelect)
  const catalog = useRegionsStore((s) => s.catalog)
  const region = activeRegionId === null ? undefined : lookupRegion(catalog, activeRegionId)
  if (region === undefined) return null

  return (
    <button
      type="button"
      onClick={openRegionSelect}
      aria-label={`현재 지역 ${region.displayName} — 지역 변경`}
      className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 shadow-md active:bg-surface-alt"
    >
      <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="text-[14px] font-bold text-ink">{region.shortName}</span>
      <ChevronDown className="size-4 shrink-0 text-ink-muted" aria-hidden />
    </button>
  )
}
