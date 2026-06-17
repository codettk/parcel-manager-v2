import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { configResponseSchema } from '../types/api/config'

/**
 * 단일 Supabase 클라이언트 — 인증 세션(lib/auth.ts)과 Realtime 구독(lib/realtime.ts)이 공유한다.
 * 한 클라이언트를 쓰면 로그인 세션 토큰이 Realtime 구독에도 자동 적용되고, 토큰 갱신이 한 곳에서 일어난다
 * (명세 §영향 범위 — realtime.ts의 중복 createClient 폐기).
 *
 * URL/anonKey는 서버가 /api/config로 내려준다 (VITE env 미사용 — 기존 realtime 경로 계승).
 * 세션은 supabase-js가 localStorage에 영속(persistSession 기본값)해 새로고침 시 복원된다 (AC-5).
 *
 * 부트스트랩 조회는 반드시 인증 토큰 비부착(raw fetch)이어야 한다 — api.config.get()(=request+getAuthToken)을
 * 쓰면 getAuthToken→getAccessToken→getSession→getSupabaseClient로 clientPromise 할당 전 재진입해
 * 동기 무한 재귀(스택 오버플로)가 난다. /api/config는 공개 엔드포인트이므로 헤더 없이 직접 가져온다.
 */
let clientPromise: Promise<SupabaseClient | null> | null = null

export function getSupabaseClient(): Promise<SupabaseClient | null> {
  clientPromise ??= (async () => {
    let supabaseUrl: string | undefined
    let supabaseAnonKey: string | undefined
    try {
      const res = await fetch('/api/config')
      if (!res.ok) throw new Error(`/api/config ${res.status}`)
      const config = configResponseSchema.parse(await res.json())
      supabaseUrl = config.supabaseUrl
      supabaseAnonKey = config.supabaseAnonKey
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[supabase] config 조회 실패 — 클라이언트 미생성:', err)
      return null
    }
    if (!supabaseUrl || !supabaseAnonKey) return null
    return createClient(supabaseUrl, supabaseAnonKey)
  })()
  return clientPromise
}

/** 테스트 격리용 — 모듈 단위 캐시 초기화 */
export function resetSupabaseClientForTest(): void {
  clientPromise = null
}
