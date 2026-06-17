import type { User } from '@supabase/supabase-js'
import type { MeResponse } from '../../src/types/api/auth.js'
import { authProviderSchema } from '../../src/types/api/auth.js'
import { createDb } from './db.js'
import { methodNotAllowed } from './http.js'
import type { Handler, HandlerContext, HandlerResponse } from './types.js'

/** 401 — 세션 토큰 없음/무효. 신원 강제 실패 시 행 미기록 보장 (AC-12) */
function unauthorized(message = '로그인이 필요합니다'): HandlerResponse {
  return { status: 401, body: { error: message } }
}

/**
 * Bearer 토큰을 Supabase GoTrue로 검증해 인증 사용자를 반환한다(무효/무토큰이면 null).
 * 토큰 검증 전용 클라이언트(persistSession=false)로 auth.getUser(token)를 호출한다 —
 * 서버는 토큰을 보관하지 않고 매 요청 검증만 한다. service_role 또는 anon 키 어느 쪽이든
 * getUser(token)는 토큰 자체의 서명·만료를 GoTrue가 검증하므로 동작한다.
 */
export async function verifyUser(ctx: HandlerContext): Promise<User | null> {
  const token = ctx.auth?.token
  if (!token) return null
  // createDb는 Node 20 WebSocket 가드 우회·키 폴백을 이미 처리한다. getUser(token)은 인자 토큰의
  // 서명·만료를 GoTrue로 검증하므로 service_role/anon 어느 클라이언트로도 동작한다.
  let client
  try {
    client = createDb(ctx.env)
  } catch {
    return null // SUPABASE_URL/KEY 미구성 — 인증 불가(401로 귀결)
  }
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

/**
 * mutate 핸들러 인증 게이트 — 검증 성공이면 { user }, 실패면 { response: 401 }.
 * 호출부는 response가 있으면 즉시 반환해 어떤 DB 쓰기도 하지 않는다(AC-12).
 */
export async function requireUser(
  ctx: HandlerContext,
): Promise<{ user: User } | { response: HandlerResponse }> {
  const user = await verifyUser(ctx)
  if (!user) return { response: unauthorized() }
  return { user }
}

/** auth.users + 메타데이터에서 제공자/표시명/아바타를 추출 (profiles 보강 우선) */
function deriveProvider(user: User): MeResponse['provider'] {
  const raw =
    (user.app_metadata?.provider as string | undefined) ??
    (user.user_metadata?.provider as string | undefined)
  const parsed = authProviderSchema.safeParse(raw)
  return parsed.success ? parsed.data : 'kakao'
}

function deriveDisplayName(user: User): string {
  const meta = user.user_metadata ?? {}
  const candidate =
    (meta.display_name as string | undefined) ??
    (meta.name as string | undefined) ??
    (meta.nickname as string | undefined) ??
    (meta.full_name as string | undefined) ??
    user.email ??
    user.id
  return candidate && candidate.length > 0 ? candidate : user.id
}

function deriveAvatar(user: User): string | null {
  const meta = user.user_metadata ?? {}
  const url = (meta.avatar_url as string | undefined) ?? (meta.picture as string | undefined)
  return url && url.length > 0 ? url : null
}

/**
 * GET /api/me — 현재 세션 사용자 신원 (meResponseSchema) 또는 401(errorResponseSchema).
 * profiles 보조 테이블 행이 있으면 표시명/아바타/제공자를 우선 사용하고, 없으면 JWT 메타로 폴백.
 */
export const meHandler: Handler = async (req, ctx) => {
  if (req.method !== 'GET') return methodNotAllowed()
  const user = await verifyUser(ctx)
  if (!user) return unauthorized()

  let displayName = deriveDisplayName(user)
  let avatarUrl = deriveAvatar(user)
  let provider = deriveProvider(user)

  // profiles 보강(있을 때만) — 없거나 조회 실패해도 JWT 폴백으로 동작
  try {
    const db = createDb(ctx.env)
    const { data } = await db
      .from('profiles')
      .select('display_name, avatar_url, provider')
      .eq('user_id', user.id)
      .maybeSingle()
    if (data) {
      const p = data as { display_name: string | null; avatar_url: string | null; provider: string | null }
      if (p.display_name) displayName = p.display_name
      if (p.avatar_url) avatarUrl = p.avatar_url
      const parsed = authProviderSchema.safeParse(p.provider)
      if (parsed.success) provider = parsed.data
    }
  } catch {
    // profiles 미존재/구성 미비는 무시 — JWT 메타 폴백
  }

  const body: MeResponse = {
    userId: user.id,
    provider,
    displayName,
    avatarUrl,
    email: user.email ?? null,
  }
  return { status: 200, body }
}
