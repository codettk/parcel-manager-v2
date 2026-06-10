import { useSyncExternalStore } from 'react'

const QUERY = '(min-width: 720px)'

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

/** 데스크탑 뷰포트(≥720px) 여부 — Sheet가 BottomSheet/SidePanel을 자동 선택할 때 사용 */
export function useIsWide(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches)
}
