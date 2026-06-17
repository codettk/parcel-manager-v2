import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import {
  getAccessToken,
  getSession,
  onAuthStateChange,
} from '../lib/auth'
import { api, registerAuthTokenProvider } from '../lib/api'
import type { MeResponse } from '../types/api/auth'

/**
 * authStatus — 부팅 게이트 최상단 우선순위 (명세 §부팅 순서):
 * - loading: 세션 복원/검증 중 — 스플래시(앱 본문·region 게이트 일체 미렌더)
 * - anon: 비로그인 — LoginView만 (AC-1)
 * - authed: 로그인 — region 게이트 → 지도로 진행 (AC-2~4)
 */
export type AuthStatus = 'loading' | 'authed' | 'anon'

export interface AuthState {
  status: AuthStatus
  session: Session | null
  /** GET /api/me 결과 — 세션은 있으나 /me 조회 실패 시 null일 수 있다(세션 자체는 유효) */
  user: MeResponse | null
  /** 부팅 1회 — 토큰 제공자 등록 + 세션 복원 + 변화 구독. App 최상단 이펙트에서 호출 */
  init: () => Promise<void>
  /** 세션 적용(복원/콜백/핸드오프) — /me 조회 후 authed 전이. 세션 null이면 anon */
  applySession: (session: Session | null) => Promise<void>
  /** 로그아웃 등으로 anon 강제 — 세션·user 비움 */
  clear: () => void
}

let initialized = false

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'loading',
  session: null,
  user: null,

  init: async () => {
    if (initialized) return
    initialized = true
    // 모든 API 요청이 현재 세션 토큰을 Authorization에 싣도록 제공자 등록 (AC-9·12)
    registerAuthTokenProvider(getAccessToken)
    // 부팅 중 어떤 오류(클라이언트 획득·세션 복원·구독)든 'loading' 정체 금지 — anon으로 폴백해 LoginView로.
    try {
      // 세션 변화(콜백·토큰갱신·로그아웃)를 단일 경로로 흡수 — applySession이 user 동기화까지 책임
      await onAuthStateChange((session) => {
        void get().applySession(session)
      })
      const session = await getSession()
      await get().applySession(session)
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[auth] 부팅 실패 — anon으로 폴백:', err)
      set({ status: 'anon', session: null, user: null })
    }
  },

  applySession: async (session) => {
    if (session === null) {
      set({ status: 'anon', session: null, user: null })
      return
    }
    let user: MeResponse | null = null
    try {
      user = await api.auth.me()
    } catch (err) {
      // 세션은 유효하나 /me 조회가 실패한 일시 오류 — 세션 신원으로는 authed 유지(앱 진입 허용)
      if (import.meta.env.DEV) console.warn('[auth] /me 조회 실패 — 세션만으로 진입:', err)
    }
    set({ status: 'authed', session, user })
  },

  clear: () => set({ status: 'anon', session: null, user: null }),
}))

/** 테스트 격리용 — init 1회 가드 해제 */
export function resetAuthInitForTest(): void {
  initialized = false
}
