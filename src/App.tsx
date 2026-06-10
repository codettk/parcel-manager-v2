import { lazy, Suspense } from 'react'
import { MapCanvas } from './features/map/MapCanvas'

const UIDemo = lazy(() => import('./dev/UIDemo'))

function App() {
  if (import.meta.env.DEV && window.location.pathname === '/__ui') {
    return (
      <Suspense fallback={null}>
        <UIDemo />
      </Suspense>
    )
  }

  return (
    <main className="h-full">
      <MapCanvas />
    </main>
  )
}

export default App
