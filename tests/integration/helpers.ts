import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClientOptions } from '@supabase/supabase-js'
import { createDb } from '../../server/handlers/db'
import type { Db } from '../../server/handlers/db'
import { tabsCollectionHandler } from '../../server/handlers/tabs'
import type { Handler, HandlerContext, HandlerResponse } from '../../server/handlers/types'
import { tabSchema } from '../../src/types/api/tabs'
import type { Tab } from '../../src/types/api/tabs'

/**
 * 통합 테스트용 인증 토큰 — 핸들러가 mutate에 세션을 강제하므로(AC-12) 실제 access token이 필요하다.
 * service_role 키로 admin.createUser → signInWithPassword로 세션을 1회 발급해 캐시한다.
 * 로컬 Supabase(GoTrue)가 떠 있어야 동작한다(통합 테스트 전제).
 */
const TEST_EMAIL = 'itest-auth@example.com'
const TEST_PASSWORD = 'itest-password-12345'
let cachedToken: string | null = null
export let TEST_USER_ID = ''

// Node 20에는 native WebSocket이 없어 supabase-js가 createClient에서 throw한다(db.ts와 동일 우회).
// Auth(GoTrue)만 쓰므로 Realtime transport는 더미로 둔다.
type RealtimeTransport = NonNullable<
  NonNullable<SupabaseClientOptions<'public'>['realtime']>['transport']
>
class UnusedWebSocket {
  constructor() {
    throw new Error('통합 테스트 인증 클라이언트는 Realtime을 사용하지 않습니다')
  }
}
const NO_REALTIME = {
  auth: { persistSession: false },
  realtime: { transport: UnusedWebSocket as unknown as RealtimeTransport },
} as const

export async function getTestToken(): Promise<string> {
  if (cachedToken) return cachedToken
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY 가 필요합니다(통합 테스트 인증 토큰 발급)',
    )
  }
  const admin = createClient(url, serviceKey, NO_REALTIME)
  // 멱등 생성 — 이미 있으면 무시하고 로그인으로 진행
  const created = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (created.error && !/already|registered|exists/i.test(created.error.message)) {
    throw new Error(`테스트 사용자 생성 실패: ${created.error.message}`)
  }
  const anon = createClient(url, anonKey, NO_REALTIME)
  const signIn = await anon.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD })
  if (signIn.error || !signIn.data.session) {
    throw new Error(`테스트 로그인 실패: ${signIn.error?.message ?? '세션 없음'}`)
  }
  cachedToken = signIn.data.session.access_token
  TEST_USER_ID = signIn.data.user.id
  return cachedToken
}

export const ctx: HandlerContext = { env: process.env }

/** 검증용 직접 DB 접근 (테스트 전제 데이터 구성·결과 확인 — 핸들러 경유가 원칙, 이건 보조) */
export const db: Db = createDb(ctx.env)

export const CLIENT_ID = 'itest-client'

/**
 * 순수 핸들러를 HandlerRequest로 직접 호출 — 별도 서버 프로세스 불필요.
 * mutate 강제(AC-12)를 통과하도록 테스트 사용자 토큰을 ctx.auth로 주입한다.
 * 무인증 401 경로는 단위 테스트(tests/unit/handlers/auth.test.ts)가 커버한다.
 */
export async function call(
  handler: Handler,
  method: string,
  params: Record<string, string> = {},
  body?: unknown,
): Promise<HandlerResponse> {
  const token = await getTestToken()
  return handler({ method, params, query: {}, body }, { env: process.env, auth: { token } })
}

/** POST /api/tabs 경유 탭 생성 (응답을 계약 스키마로 parse — AC-14 상시 적용) */
export async function createTab(name: string, clientId: string = CLIENT_ID): Promise<Tab> {
  const res = await call(tabsCollectionHandler, 'POST', {}, { name, clientId })
  if (res.status !== 200) throw new Error(`탭 생성 실패: ${res.status} ${JSON.stringify(res.body)}`)
  return tabSchema.parse(res.body)
}

/** parcels 마스터에서 실존 필지 id n개 (parcel_settings FK 전제) */
export async function pickParcelIds(n: number): Promise<string[]> {
  const { data, error } = await db
    .from('parcels')
    .select('local_id')
    .order('local_id', { ascending: true })
    .limit(n)
  if (error) throw new Error(error.message)
  const ids = ((data ?? []) as { local_id: string }[]).map((r) => r.local_id)
  if (ids.length < n) throw new Error(`parcels 행 부족: ${ids.length}/${n}`)
  return ids
}

/** 활성 탭을 정확히 1개로 만든다 (Given 구성용 — 남긴 탭 id 반환) */
export async function ensureSingleActiveTab(): Promise<string> {
  const { data, error } = await db
    .from('tabs')
    .select('tab_id')
    .is('closed_at', null)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const ids = ((data ?? []) as { tab_id: string }[]).map((r) => r.tab_id)
  if (ids.length === 0) {
    const tab = await createTab('단일 활성 탭')
    return tab.tabId
  }
  const keep = ids[0]
  if (ids.length > 1) {
    const { error: closeError } = await db
      .from('tabs')
      .update({ closed_at: new Date().toISOString() })
      .is('closed_at', null)
      .neq('tab_id', keep)
    if (closeError) throw new Error(closeError.message)
  }
  return keep
}

const DB_CONTAINER = 'supabase_db_bogugot-map-v2' // supabase/config.toml project_id 기준

/**
 * information_schema·pg_publication_tables 조회용 psql (AC-1).
 * PostgREST는 시스템 카탈로그를 노출하지 않으므로 로컬 Supabase DB 컨테이너의 psql을 사용한다.
 * 반환: 행 배열 (열은 '|' 구분)
 */
export function sql(query: string): string[][] {
  const out = execFileSync(
    'docker',
    [
      'exec',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-t',
      '-A',
      '-F',
      '|',
      '-c',
      query,
    ],
    { encoding: 'utf-8' },
  )
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split('|'))
}
