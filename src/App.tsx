import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Menu } from 'lucide-react'
import { IconButton, TabBar } from './components/ui'
import { CalculatorModeBadge } from './features/calculator/CalculatorModeBadge'
import { CalculatorResultSheet } from './features/calculator/CalculatorResultSheet'
import { CalculatorSettingsSheet } from './features/calculator/CalculatorSettingsSheet'
import { AddToGroupBanner } from './features/group/AddToGroupBanner'
import { GroupSheet } from './features/group/GroupSheet'
import { ParcelListView } from './features/list/ParcelListView'
import { MultiSelectOverlay } from './features/group/MultiSelectOverlay'
import { JimokFilter } from './features/map/JimokFilter'
import { MapCanvas } from './features/map/MapCanvas'
import { PaletteSheet } from './features/palette/PaletteSheet'
import { ParcelSheet } from './features/parcel/ParcelSheet'
import { HistorySheet } from './features/tab/HistorySheet'
import { NavDrawer } from './features/tab/NavDrawer'
import { ResetSheet } from './features/tab/ResetSheet'
import { ReleaseNotesSheet } from './features/release-notes/ReleaseNotesSheet'
import { ShareSheet } from './features/share/ShareSheet'
import { initRealtime } from './lib/realtime'
import { selectColorById, selectSelection } from './stores/selectors'
import { useUiStore } from './stores/ui'
import { useWorkspaceStore } from './stores/workspace'

const UIDemo = lazy(() => import('./dev/UIDemo'))

function App() {
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)
  // 설정 시트 열림은 App 로컬 (releaseNotesOpen 선례) — 계산기 '모드'만 ui 스토어 소관
  const [calcSettingsOpen, setCalcSettingsOpen] = useState(false)
  const overrides = useWorkspaceStore((s) => s.overrides)
  const groups = useWorkspaceStore((s) => s.groups)
  const colorById = useWorkspaceStore(selectColorById)
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTabId = useWorkspaceStore((s) => s.activeTabId)
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab)
  const createTab = useWorkspaceStore((s) => s.createTab)
  const renameTab = useWorkspaceStore((s) => s.renameTab)
  const softCloseTab = useWorkspaceStore((s) => s.softCloseTab)
  const selection = useUiStore(selectSelection)
  const tapParcel = useUiStore((s) => s.tapParcel)
  const openSheet = useUiStore((s) => s.openSheet)
  const listViewOpen = useUiStore((s) => s.listViewOpen)
  const calculatorActive = useUiStore((s) => s.calculatorActive)
  const enterCalculatorMode = useUiStore((s) => s.enterCalculatorMode)
  const openNavDrawer = useUiStore((s) => s.openNavDrawer)
  const historyOpen = useUiStore((s) => s.historyOpen)
  const paletteOpen = useUiStore((s) => s.paletteOpen)
  const shareOpen = useUiStore((s) => s.shareOpen)
  const resetSheetOpen = useUiStore((s) => s.resetSheetOpen)
  const jimokFilter = useUiStore((s) => s.jimokFilter)

  // StrictMode 이중 이펙트에서도 부팅 시퀀스는 1회만 (상태 미러가 아닌 1회성 게이트)
  const bootRequested = useRef(false)
  useEffect(() => {
    if (bootRequested.current) return
    bootRequested.current = true
    void useWorkspaceStore
      .getState()
      .boot()
      .then(async () => {
        // boot 실패 시 activeTabId가 null — realtime 미기동 (명세 §부팅 시퀀스)
        if (useWorkspaceStore.getState().activeTabId !== null) await initRealtime()
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) console.warn('[realtime] 기동 실패 — 동기화 없이 계속:', err)
      })
  }, [])

  if (import.meta.env.DEV && window.location.pathname === '/__ui') {
    return (
      <Suspense fallback={null}>
        <UIDemo />
      </Suspense>
    )
  }

  return (
    <main className="flex h-full flex-col">
      {/* 최상단 전용 행 — 햄버거 + TabBar. 지도 위 오버레이가 아니라 별도 레이아웃 행이라
          모드 배지(top-3)·지목 필터·멀티선택 토글과 y 겹침이 구조적으로 차단된다 (M-14 교훈) */}
      <div className="flex shrink-0 items-stretch border-b border-border bg-surface">
        <IconButton
          icon={Menu}
          aria-label="메뉴"
          className="shrink-0 self-center"
          onClick={openNavDrawer}
        />
        {/* TabBar는 가로 스크롤을 자체 처리 — min-w-0로 flex 자식이 넘칠 때 스크롤이 동작 */}
        <div className="min-w-0 flex-1">
          {activeTabId !== null && (
            <TabBar
              tabs={tabs.map((t) => ({ id: t.tabId, name: t.name }))}
              activeId={activeTabId}
              onSelect={(id) => void setActiveTab(id)}
              onAdd={() => void createTab()}
              onClose={(id) => void softCloseTab(id)}
              onRename={renameTab}
            />
          )}
        </div>
      </div>

      {/* 지도 영역 — 이 컨테이너 기준으로 모든 absolute 오버레이가 배치된다 (TabBar 행 아래) */}
      <div className="relative min-h-0 flex-1">
        <MapCanvas
          overrides={overrides}
          groups={groups}
          colorById={colorById}
          selection={selection}
          jimokFilter={jimokFilter}
          onParcelTap={tapParcel}
        />
        {/* 지목 필터 칩 바 (M-14) — 지도 위 상단. 목록 뷰에선 미표시(v1 view!=='list' 보존).
            top-3 중앙엔 모드 배지(계산기/멀티선택/추가)·top-16 right-3엔 멀티선택 토글이 떠서
            그 두 행을 비켜 독립 행(top-28)에 전체 폭으로 둔다 (M-14 가림 교훈 — 칩 바가 IconButton에
            가리지 않게). TabBar는 지도 컨테이너 위 별도 레이아웃 행이라 top-* 좌표와 무관하다 */}
        {!listViewOpen && (
          <div className="absolute top-28 right-3 left-3 z-10">
            <JimokFilter />
          </div>
        )}
        <MultiSelectOverlay />
        {calculatorActive && <CalculatorModeBadge />}
        {selection.addToGroupModeGroupId !== null && <AddToGroupBanner />}
        {/* 목록은 시트(z-40/50) 아래 레이어 — 행 탭으로 열린 시트가 목록 위에 뜬다 (명세 §행 탭) */}
        {listViewOpen && <ParcelListView />}
      </div>

      <NavDrawer
        onOpenReleaseNotes={() => setReleaseNotesOpen(true)}
        onOpenCalculator={() => setCalcSettingsOpen(true)}
      />
      {historyOpen && <HistorySheet />}
      {releaseNotesOpen && <ReleaseNotesSheet onClose={() => setReleaseNotesOpen(false)} />}
      {paletteOpen && <PaletteSheet />}
      {shareOpen && <ShareSheet />}
      {resetSheetOpen && <ResetSheet />}
      {calcSettingsOpen && (
        <CalculatorSettingsSheet
          onClose={() => setCalcSettingsOpen(false)}
          onStart={() => {
            setCalcSettingsOpen(false)
            enterCalculatorMode()
          }}
        />
      )}
      {openSheet === 'calcResult' && selection.selectedParcelId !== null && (
        <CalculatorResultSheet parcelId={selection.selectedParcelId} />
      )}
      {openSheet === 'parcel' && selection.selectedParcelId !== null && (
        <ParcelSheet parcelId={selection.selectedParcelId} />
      )}
      {openSheet === 'group' && selection.selectedGroupId !== null && (
        <GroupSheet groupId={selection.selectedGroupId} />
      )}
    </main>
  )
}

export default App
