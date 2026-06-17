import { useAuthStore } from '../../stores/auth'

/**
 * 세션 구독 훅 — authStatus·user를 읽는 컴포넌트(App 게이트·AccountSheet)의 단일 진입점.
 * 부팅 init은 App 최상단 이펙트가 useAuthStore.getState().init()으로 1회 호출한다(상태 미러 아님).
 */
export function useSession() {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  return { status, user, isAuthed: status === 'authed', isAnon: status === 'anon' }
}
