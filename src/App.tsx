import { lazy, Suspense, useMemo, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { IconButton } from './components/ui'
import { EMPTY_SELECTION } from './features/map/engine'
import { MapCanvas } from './features/map/MapCanvas'
import { ReleaseNotesSheet } from './features/release-notes/ReleaseNotesSheet'

const UIDemo = lazy(() => import('./dev/UIDemo'))

function App() {
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)
  // M-5 스토어 도입 전 임시 비계 — 탭 단일 선택 1건, 빈 곳 탭(null) 시 해제 (명세 §선택 상태 판정)
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null)
  const selection = useMemo(() => ({ ...EMPTY_SELECTION, selectedParcelId }), [selectedParcelId])

  if (import.meta.env.DEV && window.location.pathname === '/__ui') {
    return (
      <Suspense fallback={null}>
        <UIDemo />
      </Suspense>
    )
  }

  return (
    <main className="relative h-full">
      <MapCanvas selection={selection} onParcelTap={setSelectedParcelId} />
      {/* NavDrawer 도입 전 임시 진입점 — 도입 시 드로어 항목("릴리즈 노트")으로 이동 (명세 §진입점) */}
      <div className="absolute top-3 right-3 z-10 rounded-md bg-surface shadow-md">
        <IconButton
          icon={ScrollText}
          aria-label="릴리즈 노트"
          onClick={() => setReleaseNotesOpen(true)}
        />
      </div>
      {releaseNotesOpen && <ReleaseNotesSheet onClose={() => setReleaseNotesOpen(false)} />}
    </main>
  )
}

export default App
