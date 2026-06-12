import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Calculator, List, Palette, ScrollText, Share2 } from 'lucide-react'
import { IconButton } from './components/ui'
import { CalculatorModeBadge } from './features/calculator/CalculatorModeBadge'
import { CalculatorResultSheet } from './features/calculator/CalculatorResultSheet'
import { CalculatorSettingsSheet } from './features/calculator/CalculatorSettingsSheet'
import { AddToGroupBanner } from './features/group/AddToGroupBanner'
import { GroupSheet } from './features/group/GroupSheet'
import { ParcelListView } from './features/list/ParcelListView'
import { MultiSelectOverlay } from './features/group/MultiSelectOverlay'
import { MapCanvas } from './features/map/MapCanvas'
import { PaletteSheet } from './features/palette/PaletteSheet'
import { ParcelSheet } from './features/parcel/ParcelSheet'
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
  const selection = useUiStore(selectSelection)
  const tapParcel = useUiStore((s) => s.tapParcel)
  const openSheet = useUiStore((s) => s.openSheet)
  const listViewOpen = useUiStore((s) => s.listViewOpen)
  const openListView = useUiStore((s) => s.openListView)
  const calculatorActive = useUiStore((s) => s.calculatorActive)
  const enterCalculatorMode = useUiStore((s) => s.enterCalculatorMode)
  const paletteOpen = useUiStore((s) => s.paletteOpen)
  const openPalette = useUiStore((s) => s.openPalette)
  const shareOpen = useUiStore((s) => s.shareOpen)
  const openShare = useUiStore((s) => s.openShare)

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
    <main className="relative h-full">
      <MapCanvas
        overrides={overrides}
        groups={groups}
        colorById={colorById}
        selection={selection}
        onParcelTap={tapParcel}
      />
      {/* NavDrawer 도입 전 임시 진입점 — 도입 시 드로어 항목("릴리즈 노트")으로 이동 (명세 §진입점) */}
      <div className="absolute top-3 right-3 z-10 rounded-md bg-surface shadow-md">
        <IconButton
          icon={ScrollText}
          aria-label="릴리즈 노트"
          onClick={() => setReleaseNotesOpen(true)}
        />
      </div>
      {/* NavDrawer 도입 전 임시 진입점 (M-9) — 릴리즈 노트(top-3 right-3)·멀티선택(top-16 right-3)과 충돌 없는 위치 */}
      <div className="absolute top-3 right-16 z-10 rounded-md bg-surface shadow-md">
        <IconButton icon={List} aria-label="필지 목록" onClick={openListView} />
      </div>
      {/* NavDrawer 도입 전 임시 진입점 (M-10) — 멀티선택(top-16 right-3) 좌측 */}
      <div className="absolute top-16 right-16 z-10 rounded-md bg-surface shadow-md">
        <IconButton
          icon={Calculator}
          aria-label="자동 계산기"
          onClick={() => setCalcSettingsOpen(true)}
        />
      </div>
      {/* NavDrawer 도입 전 임시 진입점 (M-11) — top-3 행의 릴리즈 노트(right-3)·목록(right-16) 다음 칸 */}
      <div className="absolute top-3 right-29 z-10 rounded-md bg-surface shadow-md">
        <IconButton icon={Palette} aria-label="색상 팔레트" onClick={openPalette} />
      </div>
      {/* NavDrawer 도입 전 임시 진입점 (M-12) — top-3 행의 팔레트(right-29) 다음 칸 */}
      <div className="absolute top-3 right-42 z-10 rounded-md bg-surface shadow-md">
        <IconButton icon={Share2} aria-label="공유" onClick={openShare} />
      </div>
      <MultiSelectOverlay />
      {calculatorActive && <CalculatorModeBadge />}
      {selection.addToGroupModeGroupId !== null && <AddToGroupBanner />}
      {/* 목록은 시트(z-40/50) 아래 레이어 — 행 탭으로 열린 시트가 목록 위에 뜬다 (명세 §행 탭) */}
      {listViewOpen && <ParcelListView />}
      {releaseNotesOpen && <ReleaseNotesSheet onClose={() => setReleaseNotesOpen(false)} />}
      {paletteOpen && <PaletteSheet />}
      {shareOpen && <ShareSheet />}
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
