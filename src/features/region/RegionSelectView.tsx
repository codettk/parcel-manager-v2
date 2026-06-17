import { useMemo, useState } from 'react'
import { LocateFixed, LoaderCircle, MapPinOff, RefreshCw, Search, TriangleAlert, X } from 'lucide-react'
import { Input } from '../../components/ui'
import { useRegionsStore } from '../../stores/regions'
import { useUiStore } from '../../stores/ui'
import { RegionRow } from './RegionRow'
import { deriveRegionRowState } from './regionRowState'
import { RegionToast } from './RegionToast'
import { searchRegions, type Region } from './regionCatalog'
import { useGpsLocate, type GpsStatus } from './useGpsLocate'
import { useRegionCatalog } from './useRegionCatalog'

/**
 * 지역 선택 진입 게이트 (AC-15·16·17) — region 미선택 시 지도 대신 풀스크린.
 * 전체 서버 카탈로그 + 검색을 노출한다 (AC-2). 받기 가능 region 탭 = 받기→전환(AC-12),
 * 준비 중 탭 = 토스트만(AC-17), 받은/사용중 탭 = 전환.
 *
 * GPS 카드(slice 4)는 useGpsLocate 상태 머신에 배선돼 6상태(디자인 jCFcq)를 렌더한다:
 * S1 locating / S2 matched+loaded(추천 카드) / S3 matched+준비중(안내) /
 * S4 no-match(검색 폴백) / S5 permission-denied·unsupported(검색 폴백) / S6 geocode-error(실패 안내).
 * 무매칭·실패는 보구곶을 자동 추천하지 않는다(절충 5).
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
  const gps = useGpsLocate(catalog)

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
        <GpsCard status={gps.status} onLocate={gps.locate} onRetry={gps.locate} />

        {/* S2 추천 카드 — matched+loaded면 받기/전환, 준비중이면 토스트만 (handleActivate가 분기) */}
        {gps.status === 'matched' && gps.matchedRegion !== null && (
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

        {/* S3 매칭+준비중 안내 (AC-10) — 받기·전환 없음 */}
        {gps.status === 'matched' && gps.matchedRegion !== null && !gps.matchedRegion.loaded && (
          <GpsNotice
            title={`현재 위치는 ${gps.matchedRegion.shortName}인데 아직 준비 중이에요`}
            body="순서대로 데이터를 채우고 있어요. 가능한 지역에서 지도를 골라 주세요."
          />
        )}

        {/* S4 무매칭 (AC-11) — 보구곶 자동 추천 없음, 아래 검색 폴백 안내 */}
        {gps.status === 'no-match' && (
          <GpsNotice
            title="검색으로 지역을 골라 주세요"
            body="현재 위치에 해당하는 지역이 아직 없어요. 검색으로 골라 주세요."
          />
        )}

        {/* S5 권한 거부/미지원 (AC-12 — 슬라이스 1 회귀) */}
        {(gps.status === 'permission-denied' || gps.status === 'unsupported') && (
          <GpsNotice
            title="아래에서 검색해 지역을 골라 주세요"
            body="기기 설정에서 위치 권한을 켜면 다음엔 자동으로 찾아드려요."
          />
        )}

        {/* S6 역지오코딩 실패 (AC-13) — 검색 폴백, 보구곶 자동 추천 없음 */}
        {gps.status === 'geocode-error' && (
          <GpsNotice
            title="검색으로 지역을 골라 주세요"
            body="위치 확인 서비스가 일시적으로 어려워요. 앱은 계속 사용할 수 있어요."
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

/**
 * GPS 진입 카드 — 상태별 표제/아이콘/액션 (디자인 jCFcq).
 * locating(S1)·matched(S2)는 파랑 강조 CTA, 권한/무매칭(S5·S4)은 중립, 실패(S6)는 경고+다시시도.
 */
function GpsCard({
  status,
  onLocate,
  onRetry,
}: {
  status: GpsStatus
  onLocate: () => void
  onRetry: () => void
}) {
  // 실패 — 경고 카드 + 다시시도 (S6)
  if (status === 'geocode-error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left"
      >
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-danger/10"
          aria-hidden
        >
          <TriangleAlert className="size-5 text-danger" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[16px] font-bold text-ink">위치를 확인하지 못했어요</span>
          <span className="truncate text-[12.5px] text-ink-muted">
            잠시 후 다시 시도하거나 검색으로 골라 주세요
          </span>
        </span>
        <RefreshCw className="size-5 shrink-0 text-primary" aria-hidden />
      </button>
    )
  }

  // 권한 거부/미지원 — 중립 카드 (S5)
  if (status === 'permission-denied' || status === 'unsupported') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-alt"
          aria-hidden
        >
          <MapPinOff className="size-5 text-ink-muted" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[16px] font-bold text-ink">위치 권한을 확인할 수 없어요</span>
          <span className="truncate text-[12.5px] text-ink-muted">
            위치 사용이 꺼져 있거나 지원되지 않아요
          </span>
        </span>
      </div>
    )
  }

  // 탐색중/매칭/무매칭/대기 — 파랑 강조 CTA (S1·S2·S4·idle)
  const isLocating = status === 'locating'
  return (
    <button
      type="button"
      onClick={onLocate}
      disabled={isLocating}
      className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 p-4 text-left disabled:opacity-90"
    >
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary"
        aria-hidden
      >
        <LocateFixed className="size-5 text-surface" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[16px] font-bold text-ink">
          {isLocating ? '현재 위치 확인 중…' : '현재 위치로 시작'}
        </span>
        <span className="truncate text-[12.5px] text-ink-muted">
          {isLocating
            ? '위치를 잡아 행정구역을 확인하고 있어요'
            : '내 위치의 지역을 자동으로 찾아드려요'}
        </span>
      </span>
      {isLocating && (
        <LoaderCircle className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
      )}
    </button>
  )
}

/**
 * GPS 보조 안내 박스 — 준비중/무매칭/권한/실패 공용 (디자인 jCFcq 안내 카드).
 * 정적 안내 — 행동(검색)은 아래 항상 노출된 검색 입력이 담당한다(절충 1·5, 검색 폴백 항상 가능).
 */
function GpsNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface-alt px-3.5 py-3">
      <Search className="size-[18px] shrink-0 text-ink-muted" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-bold text-ink">{title}</span>
        <span className="text-[12px] leading-relaxed text-ink-muted">{body}</span>
      </span>
    </div>
  )
}
