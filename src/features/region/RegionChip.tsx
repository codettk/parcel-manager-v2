import { ChevronDown, MapPin } from 'lucide-react'
import { useUiStore } from '../../stores/ui'
import { getRegionById } from './regionCatalog'

/**
 * 지도 상단 현재 region 칩 (AC-8) — 탭 시 지역 선택 화면 재진입 (AC-9).
 * region 미선택 시엔 게이트가 지도를 가리므로 렌더되지 않는다 (App 분기).
 */
export function RegionChip() {
  const activeRegionId = useUiStore((s) => s.activeRegionId)
  const openRegionSelect = useUiStore((s) => s.openRegionSelect)
  const region = activeRegionId === null ? undefined : getRegionById(activeRegionId)
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
