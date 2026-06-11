import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js'

export type Db = SupabaseClient

type RealtimeTransport = NonNullable<
  NonNullable<SupabaseClientOptions<'public'>['realtime']>['transport']
>

/**
 * Node 20에는 native WebSocket이 없어 supabase-js v2.108이 클라이언트 생성 시점에 throw한다.
 * 서버 핸들러는 Realtime을 사용하지 않으므로(구독은 프론트 M-6 소관) 더미 transport로 우회.
 */
class UnusedWebSocket {
  constructor() {
    throw new Error('서버 핸들러는 Realtime을 사용하지 않습니다')
  }
}

/** ctx.env에서 Supabase 클라이언트 생성 — 핸들러는 req/res가 아닌 이 팩토리만 사용한다 */
export function createDb(env: Record<string, string | undefined>): Db {
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되지 않았습니다')
  }
  return createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: UnusedWebSocket as unknown as RealtimeTransport },
  })
}
