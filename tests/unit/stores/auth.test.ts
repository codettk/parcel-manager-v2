import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth'
import type { MeResponse } from '../../../src/types/api/auth'

const ME: MeResponse = {
  userId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  provider: 'kakao',
  displayName: '보구곶',
  avatarUrl: null,
  email: null,
}

// 최소 Session 형태 — applySession은 토큰 존재만 보고 user를 /me로 채운다
const SESSION = { access_token: 'tok', user: { id: ME.userId } } as unknown as Session

beforeEach(() => {
  useAuthStore.setState({ status: 'loading', session: null, user: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('auth 스토어 applySession (게이트 우선순위)', () => {
  it('세션 null이면 anon — user 비움 (AC-1 LoginView 게이트)', async () => {
    await useAuthStore.getState().applySession(null)
    expect(useAuthStore.getState().status).toBe('anon')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('세션 있으면 /me 조회 후 authed — user 채움 (AC-2·4)', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValueOnce(ME)
    await useAuthStore.getState().applySession(SESSION)
    expect(useAuthStore.getState().status).toBe('authed')
    expect(useAuthStore.getState().user).toEqual(ME)
  })

  it('세션은 유효하나 /me 조회 실패면 authed 유지(앱 진입 허용) + user는 null', async () => {
    vi.spyOn(api.auth, 'me').mockRejectedValueOnce(new Error('네트워크'))
    await useAuthStore.getState().applySession(SESSION)
    expect(useAuthStore.getState().status).toBe('authed')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('clear()는 anon으로 강제하고 세션·user를 비운다 (AC-6 로그아웃)', () => {
    useAuthStore.setState({ status: 'authed', session: SESSION, user: ME })
    useAuthStore.getState().clear()
    expect(useAuthStore.getState().status).toBe('anon')
    expect(useAuthStore.getState().session).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })
})
