import { ArrowLeft, Check, Info, MapPinned, Plus } from 'lucide-react'
import { useUiStore } from '../../stores/ui'
import { loadedRegions, type Region } from './regionCatalog'

/**
 * 지역 관리 — 받은(데이터 적재) region 열람·전환 (AC-11). 메뉴 드로어 "지역 관리"에서 진입.
 * 비범위(명세): "지역 추가/받기/제거" 실제 동작 없음 — 추가 진입점은 지역 선택 화면으로 연결만 한다.
 */
export function RegionManageView() {
  const activeRegionId = useUiStore((s) => s.activeRegionId)
  const selectRegion = useUiStore((s) => s.selectRegion)
  const closeRegionManage = useUiStore((s) => s.closeRegionManage)
  const openRegionSelect = useUiStore((s) => s.openRegionSelect)

  const regions = loadedRegions()
  const totalSize = regions.reduce((sum, r) => sum + parseFloat(r.sizeLabel), 0)

  function handleSwitch(region: Region) {
    selectRegion(region.id) // 적재 region만 목록에 있으므로 항상 전환 성공 (AC-11)
  }

  function handleAdd() {
    closeRegionManage()
    openRegionSelect()
  }

  return (
    <section className="flex h-full flex-col bg-surface-alt">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="뒤로"
            onClick={closeRegionManage}
            className="flex size-9 items-center justify-center rounded-full text-ink active:bg-surface-alt"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-[18px] font-extrabold text-ink">지역 관리</h1>
        </div>
        <button
          type="button"
          aria-label="지역 추가"
          onClick={handleAdd}
          className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary active:brightness-95"
        >
          <Plus className="size-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-4 pb-6">
        <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2.5">
          <Info className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="text-[12.5px] font-medium text-primary">
            받은 지역은 오프라인에서도 열람할 수 있어요
          </span>
        </div>

        <p className="text-[12.5px] font-bold tracking-wide text-ink-muted">
          내 지역 {regions.length}곳
        </p>

        <div className="flex flex-col gap-2">
          {regions.map((region) => {
            const active = region.id === activeRegionId
            const cardClass = active
              ? 'flex w-full items-center gap-3 rounded-lg border border-primary bg-primary/5 px-3.5 py-3.5 text-left'
              : 'flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3.5 text-left active:bg-surface-alt'
            return (
              <button
                key={region.id}
                type="button"
                className={cardClass}
                onClick={() => handleSwitch(region)}
              >
                <span
                  className={
                    active
                      ? 'flex size-11 shrink-0 items-center justify-center rounded-md bg-primary'
                      : 'flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10'
                  }
                  aria-hidden
                >
                  <MapPinned className={active ? 'size-5 text-surface' : 'size-5 text-primary'} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15.5px] font-bold text-ink">
                      {region.displayName}
                    </span>
                    {active && (
                      <span className="shrink-0 rounded-sm bg-primary px-1.5 py-0.5 text-[11px] font-bold text-surface">
                        사용 중
                      </span>
                    )}
                  </span>
                  <span className="truncate font-mono text-[11.5px] text-ink-muted">
                    필지 {region.parcelCount.toLocaleString('ko-KR')} · {region.sizeLabel}
                  </span>
                </span>
                {active && <Check className="size-5 shrink-0 text-primary" aria-hidden />}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center justify-center gap-2 rounded-lg border border-primary bg-surface py-3.5 text-[14.5px] font-bold text-primary active:bg-surface-alt"
        >
          <Plus className="size-5" />
          지역 추가
        </button>

        <p className="text-center font-mono text-[11.5px] text-ink-muted">
          사용 중 저장공간 {totalSize.toFixed(1)}MB
        </p>
      </div>
    </section>
  )
}
