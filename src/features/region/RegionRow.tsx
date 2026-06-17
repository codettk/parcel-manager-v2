import { Check, MapPin } from 'lucide-react'
import type { Region } from './regionCatalog'

export interface RegionRowProps {
  region: Region
  /** 현재 사용 중인 region — "사용 중" 배지 + 강조 테두리 */
  active?: boolean
  /** 부제 (예: "내가 마지막으로 본 지역"). 미지정 시 region.displayName 하단에 필지수만 */
  subtitle?: string
  onSelect: (region: Region) => void
}

/**
 * region 목록 행 (선택·검색·관리 공용). 미적재 region은 "준비 중" 칩을 보이고
 * 탭은 호출부의 onSelect로 위임 — 미적재 진입 차단·안내는 store.selectRegion이 책임진다 (AC-6).
 */
export function RegionRow({ region, active = false, subtitle, onSelect }: RegionRowProps) {
  const containerClass = active
    ? 'flex w-full items-center gap-3 rounded-md border border-primary bg-primary/5 px-3 py-3 text-left'
    : 'flex w-full items-center gap-3 rounded-md border border-border bg-surface px-3 py-3 text-left active:bg-surface-alt'

  return (
    <button type="button" className={containerClass} onClick={() => onSelect(region)}>
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary/10"
        aria-hidden
      >
        <MapPin className="size-5 text-primary" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold text-ink">{region.displayName}</span>
        <span className="truncate text-[12px] text-ink-muted">
          {subtitle ?? `필지 ${region.parcelCount.toLocaleString('ko-KR')}`}
        </span>
      </span>
      <span className="flex shrink-0 items-center">
        {active ? (
          <span className="rounded-sm bg-primary px-2.5 py-1 text-[12px] font-bold text-surface">
            사용 중
          </span>
        ) : region.loaded ? (
          <Check className="size-5 text-primary" aria-label="받은 지역" />
        ) : (
          <span className="rounded-sm bg-surface-alt px-2.5 py-1 text-[12px] font-medium text-ink-muted">
            준비 중
          </span>
        )}
      </span>
    </button>
  )
}
