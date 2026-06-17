import { useMemo, useState } from 'react'
import { ChevronRight, LocateFixed, Search, X } from 'lucide-react'
import { Input } from '../../components/ui'
import { useUiStore } from '../../stores/ui'
import { RegionRow } from './RegionRow'
import { REGION_CATALOG, SEED_REGION, searchRegions, type Region } from './regionCatalog'
import { useGpsLocate } from './useGpsLocate'

/**
 * 지역 선택 진입 게이트 (AC-4~7) — region 미선택 시 지도 대신 풀스크린으로 표시된다.
 * 칩/메뉴로 재진입할 때도 동일 뷰. 검색·GPS·목록에서 적재 region 탭 시 지도로 전환된다.
 * 미적재 region 탭은 "준비 중" 안내만 띄우고 전환하지 않는다 (AC-6).
 */
export function RegionSelectView() {
  const activeRegionId = useUiStore((s) => s.activeRegionId)
  const selectRegion = useUiStore((s) => s.selectRegion)
  const closeRegionSelect = useUiStore((s) => s.closeRegionSelect)
  const [query, setQuery] = useState('')
  const [unavailable, setUnavailable] = useState<Region | null>(null)
  const gps = useGpsLocate()

  // region 진입 후 칩으로 재진입한 경우에만 닫기(X) 노출 — 최초 게이트(미선택)에선 닫을 곳이 없다
  const canClose = activeRegionId !== null

  const trimmed = query.trim()
  const results = useMemo(() => (trimmed === '' ? null : searchRegions(query)), [query, trimmed])

  // 검색이 없을 때 보이는 "최근/받은 지역" — 적재 region을 앞세운 카탈로그 (현재 region 강조)
  const browseList = REGION_CATALOG

  function handleSelect(region: Region) {
    setUnavailable(null)
    const ok = selectRegion(region.id)
    if (!ok) setUnavailable(region) // 미적재 — "준비 중" 안내 (AC-6)
  }

  const recommended = gps.matchedRegion ?? SEED_REGION

  return (
    <section className="flex h-full flex-col bg-surface-alt">
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
        {/* GPS 진입 카드 (AC-7) */}
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
          <ChevronRight className="size-5 shrink-0 text-primary" />
        </button>

        {/* GPS 권한 거부/미지원 폴백 안내 (AC-7) — 검색 경로는 계속 사용 가능 */}
        {gps.status === 'denied' && (
          <div className="rounded-md border border-border bg-surface px-3 py-2.5 text-[12.5px] text-ink-muted">
            위치 권한을 확인할 수 없어요. 아래에서 검색해 지역을 골라 주세요.
          </div>
        )}
        {/* GPS 추천 적용 — 좌표 확보 시 바로 진입 버튼 노출 */}
        {gps.status === 'matched' && gps.matchedRegion && (
          <RegionRow region={gps.matchedRegion} subtitle="현재 위치 추천" onSelect={handleSelect} />
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

        {/* 미적재 region "준비 중" 안내 (AC-6) */}
        {unavailable && (
          <div className="rounded-md border border-border bg-surface px-3 py-2.5 text-[13px] text-ink-muted">
            <span className="font-semibold text-ink">{unavailable.displayName}</span> 지역은 아직
            준비 중이에요. 현재는 {SEED_REGION.displayName} 지적도만 이용할 수 있어요.
          </div>
        )}

        {results === null ? (
          <>
            <p className="mt-1 text-[12.5px] font-bold tracking-wide text-ink-muted">최근 지역</p>
            <div className="flex flex-col gap-2">
              {browseList.map((region) => (
                <RegionRow
                  key={region.id}
                  region={region}
                  active={region.id === activeRegionId}
                  subtitle={region.id === SEED_REGION.id ? '내가 마지막으로 본 지역' : undefined}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-[12.5px] font-bold tracking-wide text-ink-muted">
              검색 결과 {results.length}곳
            </p>
            <div className="flex flex-col gap-2">
              {results.map((region) => (
                <RegionRow
                  key={region.id}
                  region={region}
                  active={region.id === activeRegionId}
                  onSelect={handleSelect}
                />
              ))}
              {results.length === 0 && (
                <p className="px-1 py-6 text-center text-[13px] text-ink-muted">
                  검색 결과가 없어요.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
