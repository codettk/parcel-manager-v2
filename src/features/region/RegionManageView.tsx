import { useMemo, useState } from 'react'
import { ArrowLeft, Info, Plus, Trash2, Repeat } from 'lucide-react'
import { ConfirmInline } from '../../components/ui'
import { useRegionsStore } from '../../stores/regions'
import { useUiStore } from '../../stores/ui'
import { RegionRow } from './RegionRow'
import { deriveRegionRowState } from './regionRowState'
import { lookupRegion, type Region } from './regionCatalog'
import { useRegionCatalog } from './useRegionCatalog'

/**
 * 지역 관리 (AC-13·14) — 내가 받은 region만 열람·전환·제거. 메뉴 드로어에서 진입.
 * 비활성 region은 ⋮로 제거 메뉴(전환/제거 ConfirmInline 2단계) 진입,
 * 현재 활성(사용 중) region은 제거 가드 — 전환을 먼저 요구해 빈 지도 상태를 막는다.
 */
export function RegionManageView() {
  const { catalog } = useRegionCatalog()
  const activeRegionId = useUiStore((s) => s.activeRegionId)
  const selectRegion = useUiStore((s) => s.selectRegion)
  const closeRegionManage = useUiStore((s) => s.closeRegionManage)
  const openRegionSelect = useUiStore((s) => s.openRegionSelect)
  const acquiredIds = useRegionsStore((s) => s.acquiredIds)
  const removeRegion = useRegionsStore((s) => s.remove)

  // 행 ⋮로 펼친 region — 전환/제거 메뉴를 그 행 아래 인라인으로 연다 (팝오버 동형)
  const [menuRegionId, setMenuRegionId] = useState<string | null>(null)

  const regions = useMemo(
    () =>
      acquiredIds
        .map((id) => lookupRegion(catalog, id))
        .filter((r): r is Region => r !== undefined)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [acquiredIds, catalog],
  )
  const totalSize = regions.reduce((sum, r) => sum + parseFloat(r.sizeLabel), 0)

  function handleSwitch(region: Region) {
    setMenuRegionId(null)
    selectRegion(region.id)
  }

  function handleAdd() {
    closeRegionManage()
    openRegionSelect()
  }

  function handleRemove(region: Region) {
    setMenuRegionId(null)
    removeRegion(region.id)
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
            const menuOpen = menuRegionId === region.id
            return (
              <div key={region.id} className="flex flex-col gap-2">
                <RegionRow
                  region={region}
                  state={deriveRegionRowState(region, {
                    activeRegionId,
                    acquired: true,
                    acquiring: false,
                  })}
                  onActivate={handleSwitch}
                  onMore={(r) => setMenuRegionId(menuOpen ? null : r.id)}
                />
                {menuOpen && (
                  <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
                    {!active && (
                      <button
                        type="button"
                        onClick={() => handleSwitch(region)}
                        className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-[14px] font-medium text-ink active:bg-surface-alt"
                      >
                        <Repeat className="size-4 shrink-0 text-primary" aria-hidden />이 지역으로
                        전환
                      </button>
                    )}
                    {active ? (
                      // 활성 region 제거 가드 (AC-14) — 제거 비활성 + 전환 우선 안내. 빈 지도 방지
                      <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2.5">
                        <Info className="size-4 shrink-0 text-primary" aria-hidden />
                        <span className="text-[12.5px] font-semibold text-primary">
                          사용 중인 지역은 제거할 수 없어요. 다른 지역으로 먼저 전환하세요.
                        </span>
                      </div>
                    ) : (
                      // 비활성 region 제거 (AC-13) — ConfirmInline 2단계
                      <ConfirmInline
                        label={
                          <span className="flex items-center gap-1.5">
                            <Trash2 className="size-4" aria-hidden />
                            지역 제거
                          </span>
                        }
                        confirmLabel="제거"
                        onConfirm={() => handleRemove(region)}
                      />
                    )}
                  </div>
                )}
              </div>
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

        {regions.length > 0 && (
          <p className="text-center font-mono text-[11.5px] text-ink-muted">
            사용 중 저장공간 {totalSize.toFixed(1)}MB
          </p>
        )}
      </div>
    </section>
  )
}
