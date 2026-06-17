import { CircleCheck, Download, LoaderCircle, MapPinned, MoreVertical } from 'lucide-react'
import type { Region } from './regionCatalog'
import type { RegionRowState } from './regionRowState'

export interface RegionRowProps {
  region: Region
  state: RegionRowState
  /** 부제 (예: "현재 위치 추천"). 미지정 시 region.parcelCount·sizeLabel 메타 */
  subtitle?: string
  /** 행 본문 탭 — 선택/전환/받기 트리거. 호출부가 state에 따라 의미를 정한다 */
  onActivate: (region: Region) => void
  /** ⋮ 더보기 탭 (acquired 상태에서만 노출) — 제거 메뉴 진입 */
  onMore?: (region: Region) => void
}

/** region 목록 행 (선택·검색·관리 공용). 좌측 핀·이름·메타는 불변, 우측 액션 슬롯만 state별 교체. */
export function RegionRow({ region, state, subtitle, onActivate, onMore }: RegionRowProps) {
  const emphasized = state === 'active'
  const dimmed = state === 'upcoming'

  const containerClass = emphasized
    ? 'flex w-full items-center gap-3 rounded-md border border-primary bg-primary/5 px-3 py-3 text-left'
    : dimmed
      ? 'flex w-full items-center gap-3 rounded-md border border-border bg-surface px-3 py-3 text-left opacity-55'
      : 'flex w-full items-center gap-3 rounded-md border border-border bg-surface px-3 py-3 text-left active:bg-surface-alt'

  const pinClass = emphasized
    ? 'flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary'
    : dimmed
      ? 'flex size-10 shrink-0 items-center justify-center rounded-sm bg-surface-alt'
      : 'flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary/10'

  return (
    <div className={containerClass}>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={region.displayName}
        onClick={() => onActivate(region)}
      >
        <span className={pinClass} aria-hidden>
          <MapPinned
            className={
              emphasized
                ? 'size-5 text-surface'
                : dimmed
                  ? 'size-5 text-ink-muted'
                  : 'size-5 text-primary'
            }
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span
              className={
                dimmed
                  ? 'truncate text-[15px] font-bold text-ink-muted'
                  : 'truncate text-[15px] font-bold text-ink'
              }
            >
              {region.displayName}
            </span>
            {state === 'active' && (
              <span className="shrink-0 rounded-sm bg-primary px-1.5 py-0.5 text-[11px] font-bold text-surface">
                사용 중
              </span>
            )}
          </span>
          <span className="truncate font-mono text-[12px] text-ink-muted">
            {subtitle ??
              (state === 'upcoming'
                ? '데이터 준비 중'
                : `필지 ${region.parcelCount.toLocaleString('ko-KR')} · ${region.sizeLabel}`)}
          </span>
        </span>
      </button>

      <span className="flex shrink-0 items-center">
        {state === 'active' && (
          <CircleCheck className="size-5 text-primary" aria-label="사용 중" />
        )}
        {state === 'acquired' && (
          <button
            type="button"
            aria-label={`${region.displayName} 더보기`}
            onClick={() => onMore?.(region)}
            className="flex size-9 items-center justify-center rounded-full text-ink-muted active:bg-surface-alt"
          >
            <MoreVertical className="size-5" />
          </button>
        )}
        {state === 'available' && (
          <button
            type="button"
            aria-label={`${region.displayName} 받기`}
            onClick={() => onActivate(region)}
            className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-[13px] font-bold text-primary active:brightness-95"
          >
            <Download className="size-3.5" aria-hidden />
            받기
          </button>
        )}
        {state === 'acquiring' && (
          <span className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-[13px] font-bold text-primary">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            받는 중…
          </span>
        )}
        {state === 'upcoming' && (
          <span className="rounded-sm bg-surface-alt px-2.5 py-1 text-[12px] font-medium text-ink-muted">
            준비 중
          </span>
        )}
      </span>
    </div>
  )
}
