import { useMemo, useState } from 'react'
import { LocateFixed, Search, X } from 'lucide-react'
import { Input } from '../../components/ui'
import { useRegionsStore } from '../../stores/regions'
import { useUiStore } from '../../stores/ui'
import { RegionRow } from './RegionRow'
import { deriveRegionRowState } from './regionRowState'
import { RegionToast } from './RegionToast'
import { SEED_REGION, searchRegions, type Region } from './regionCatalog'
import { useGpsLocate } from './useGpsLocate'
import { useRegionCatalog } from './useRegionCatalog'

/**
 * 지역 선택 진입 게이트 (AC-15·16·17) — region 미선택 시 지도 대신 풀스크린.
 * 전체 서버 카탈로그 + 검색을 노출한다 (AC-2). 받기 가능 region 탭 = 받기→전환(AC-12),
 * 준비 중 탭 = 토스트만(AC-17), 받은/사용중 탭 = 전환.
 */
export function RegionSelectView() {
  const { catalog } = useRegionCatalog()
  const activeRegionId = useUiStore((s) => s.activeRegionId)
  const selectRegion = useUiStore((s) => s.selectRegion)
  const closeRegionSelect = useUiStore((s) => s.closeRegionSelect)
  const acquiredIds = useRegionsStore((s) => s.acquiredIds)
  const acquiring = useRegionsStore((s) => s.acquiring)
  const acquire = useRegionsStore((s) => s.acquire)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const gps = useGpsLocate()

  // region 진입 후 칩으로 재진입한 경우에만 닫기(X) 노출 — 최초 게이트(미선택)에선 닫을 곳이 없다
  const canClose = activeRegionId !== null

  const trimmed = query.trim()
  const results = useMemo(
    () => (trimmed === '' ? searchRegions(catalog, '') : searchRegions(catalog, query)),
    [catalog, query, trimmed],
  )
  const isSearching = trimmed !== ''

  async function handleActivate(region: Region) {
    if (!region.loaded) {
      // 준비 중 — 받기·전환 모두 미발생, 토스트만 (AC-17)
      setToast('이 지역은 아직 준비 중이에요. 곧 받을 수 있어요.')
      return
    }
    // 적재 region: 미보유면 받기 후 전환, 보유/활성이면 바로 전환 (AC-12)
    if (!acquiredIds.includes(region.id)) {
      const ok = await acquire(region.id)
      if (!ok) {
        setToast('이 지역은 아직 준비 중이에요. 곧 받을 수 있어요.')
        return
      }
    }
    selectRegion(region.id)
  }

  const recommended = gps.matchedRegion ?? SEED_REGION

  return (
    <section className="relative flex h-full flex-col bg-surface-alt">
      <header className="flex items-start gap-3 border-b border-border bg-surface px-5 pt-4 pb-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-[21px] font-extrabold text-ink">지역 선택</h1>
          <p className="text-[13px] text-ink-muted">지적도를 불러올 지역을 고르세요</p>
        </div>
        {canClose && (
          <button
            type="button"
            aria-label="닫기"
            onClick={closeRegionSelect}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted active:bg-surface-alt"
          >
            <X className="size-5" />
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-4 pb-6">
        {/* GPS 진입 카드 */}
        <button
          type="button"
          onClick={gps.locate}
          className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 p-4 text-left"
        >
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary"
            aria-hidden
          >
            <LocateFixed className="size-5 text-surface" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center gap-2">
              <span className="text-[16px] font-bold text-ink">
                {gps.status === 'locating' ? '위치 확인 중…' : '현재 위치로 시작'}
              </span>
              <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[11px] font-bold text-surface">
                추천
              </span>
            </span>
            <span className="truncate text-[12.5px] text-ink-muted">
              {gps.status === 'matched'
                ? recommended.sido + ' ' + recommended.sigungu + ' ' + recommended.emd
                : SEED_REGION.sido + ' ' + SEED_REGION.sigungu + ' ' + SEED_REGION.emd}
            </span>
          </span>
        </button>

        {gps.status === 'denied' && (
          <div className="rounded-md border border-border bg-surface px-3 py-2.5 text-[12.5px] text-ink-muted">
            위치 권한을 확인할 수 없어요. 아래에서 검색해 지역을 골라 주세요.
          </div>
        )}
        {gps.status === 'matched' && gps.matchedRegion && (
          <RegionRow
            region={gps.matchedRegion}
            state={deriveRegionRowState(gps.matchedRegion, {
              activeRegionId,
              acquired: acquiredIds.includes(gps.matchedRegion.id),
              acquiring: acquiring === gps.matchedRegion.id,
            })}
            subtitle="현재 위치 추천"
            onActivate={(r) => void handleActivate(r)}
          />
        )}

        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="시·군·구, 읍·면·동 검색"
            aria-label="지역 검색"
            className="pl-9"
          />
        </div>

        <p className="mt-1 text-[12.5px] font-bold tracking-wide text-ink-muted">
          {isSearching ? `검색 결과 ${results.length}곳` : '지역 목록'}
        </p>
        <div className="flex flex-col gap-2">
          {results.map((region) => (
            <RegionRow
              key={region.id}
              region={region}
              state={deriveRegionRowState(region, {
                activeRegionId,
                acquired: acquiredIds.includes(region.id),
                acquiring: acquiring === region.id,
              })}
              onActivate={(r) => void handleActivate(r)}
            />
          ))}
          {isSearching && results.length === 0 && (
            <p className="px-1 py-6 text-center text-[13px] text-ink-muted">검색 결과가 없어요.</p>
          )}
        </div>
      </div>

      {toast !== null && <RegionToast message={toast} onDismiss={() => setToast(null)} />}
    </section>
  )
}
