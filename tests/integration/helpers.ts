import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { createDb } from '../../server/handlers/db'
import type { Db } from '../../server/handlers/db'
import { tabsCollectionHandler } from '../../server/handlers/tabs'
import type { Handler, HandlerContext, HandlerResponse } from '../../server/handlers/types'
import { tabSchema } from '../../src/types/api/tabs'
import type { Tab } from '../../src/types/api/tabs'

export const ctx: HandlerContext = { env: process.env }

/** 검증용 직접 DB 접근 (테스트 전제 데이터 구성·결과 확인 — 핸들러 경유가 원칙, 이건 보조) */
export const db: Db = createDb(ctx.env)

export const CLIENT_ID = 'itest-client'

/** 순수 핸들러를 HandlerRequest로 직접 호출 — 별도 서버 프로세스 불필요 */
export async function call(
  handler: Handler,
  method: string,
  params: Record<string, string> = {},
  body?: unknown,
): Promise<HandlerResponse> {
  return handler({ method, params, query: {}, body }, ctx)
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
