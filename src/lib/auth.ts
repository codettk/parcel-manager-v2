import type { Session, Subscription } from '@supabase/supabase-js'
import type { HandoffToken } from '../types/api/auth'
import { getSupabaseClient } from './supabase'

/**
 * Supabase Auth(GoTrue) 래퍼 — UI/스토어는 supabase-js를 직접 import하지 않고 이 모듈만 쓴다.
 * 단일 클라이언트(lib/supabase.ts)를 공유하므로 세션 토큰이 Realtime 구독에도 적용된다 (명세 §결정 3 분리는
 * 토큰=신원 / clientId=에코가드 분리로, lib/api.ts·realtime.ts에서 보장).
 */

/** 카카오 OAuth 리다이렉트 콜백 경로 — index.html이 항상 같은 SPA를 서빙한다 */
export const OAUTH_CALLBACK_PATH = '/auth/callback'

function callbackUrl(): string {
  return `${window.location.origin}${OAUTH_CALLBACK_PATH}`
}

/** Supabase 미구성(키 없음) 환경 — 호출부가 "준비 중/오류"로 분기하게 throw 대신 null 반환 경로를 둔다 */
export class AuthUnavailableError extends Error {
  constructor(message = 'Supabase 인증이 구성되지 않았습니다') {
    super(message)
    this.name = 'AuthUnavailableError'
  }
}

/** 현재 영속 세션 복원 시도 — 없으면 null (AC-5 새로고침 복원의 부팅 진입점) */
export async function getSession(): Promise<Session | null> {
  const client = await getSupabaseClient()
  if (client === null) return null
  const { data } = await client.auth.getSession()
  return data.session
}

/**
 * 세션 변화 구독 — 로그인/로그아웃/토큰갱신 시 콜백. 반환 함수로 해제.
 * 클라이언트 미구성이면 no-op 구독을 반환한다 (호출부 단순화).
 */
export async function onAuthStateChange(
  callback: (session: Session | null) => void,
): Promise<() => void> {
  const client = await getSupabaseClient()
  if (client === null) return () => {}
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session))
  const sub: Subscription = data.subscription
  return () => sub.unsubscribe()
}

/**
 * 카카오 웹 OAuth 시작 (AC-2) — 제공자 동의 화면으로 리다이렉트한다. 성공 시 OAUTH_CALLBACK_PATH로 복귀.
 * 클라이언트 미구성이면 AuthUnavailableError throw (호출부가 핸드오프 에러 뷰로 폴백).
 */
export async function signInWithKakao(): Promise<void> {
  const client = await getSupabaseClient()
  if (client === null) throw new AuthUnavailableError()
  const { error } = await client.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: callbackUrl() },
  })
  if (error) throw error
}

/** 로그아웃 (AC-6) — 세션 파기. onAuthStateChange가 anon으로 전이시킨다 */
export async function signOut(): Promise<void> {
  const client = await getSupabaseClient()
  if (client === null) return
  await client.auth.signOut()
}

/**
 * 네이티브 핸드오프 토큰으로 세션 수립 (AC-13) — 네이티브 셸이 소셜 로그인 후 전달한 토큰을 주입한다.
 * refreshToken이 없으면 만료 후 갱신 불가하나 이번 슬라이스는 수신 계약 검증까지라 단발 세션도 허용한다.
 * 실패 시 throw — authBridge가 핸드오프 에러로 폴백(AC-14).
 */
export async function setSessionFromHandoff(token: HandoffToken): Promise<Session | null> {
  const client = await getSupabaseClient()
  if (client === null) throw new AuthUnavailableError()
  const { data, error } = await client.auth.setSession({
    access_token: token.accessToken,
    // setSession은 refresh_token을 요구하지만, 단발 핸드오프는 access_token만 올 수 있어 빈 문자열 폴백
    refresh_token: token.refreshToken ?? '',
  })
  if (error) throw error
  return data.session
}

/** OAuth 콜백 URL에 담긴 세션 코드/해시를 처리해 세션을 확정 — 콜백 라우트에서 호출 (AC-2) */
export async function completeOAuthFromUrl(): Promise<Session | null> {
  const client = await getSupabaseClient()
  if (client === null) throw new AuthUnavailableError()
  // supabase-js v2(detectSessionInUrl 기본 true)는 ?code=… (PKCE) 콜백을 exchange해야 세션이 선다.
  const code = new URLSearchParams(window.location.search).get('code')
  if (code !== null) {
    const { data, error } = await client.auth.exchangeCodeForSession(code)
    if (error) throw error
    return data.session
  }
  // 암시적 흐름(#access_token=…)은 detectSessionInUrl이 이미 처리 — getSession으로 확정만 한다
  const { data } = await client.auth.getSession()
  return data.session
}

/** 현재 세션의 access token — lib/api.ts가 Authorization 헤더에 부착 (AC-9·12) */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession()
  return session?.access_token ?? null
}
