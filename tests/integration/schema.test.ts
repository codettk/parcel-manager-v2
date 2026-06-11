import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { db, sql } from './helpers'

const root = fileURLToPath(new URL('../..', import.meta.url))

async function parcelsCount(): Promise<number> {
  const { count, error } = await db
    .from('parcels')
    .select('local_id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  return count ?? 0
}

describe('AC-1: supabase db reset 후 스키마 (테이블 6종 + PK/FK/CHECK + Realtime publication)', () => {
  it('public 스키마에 테이블 6종이 존재한다', () => {
    const tables = sql(
      "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name",
    ).map((r) => r[0])
    for (const t of [
      'app_config',
      'color_labels',
      'parcel_groups',
      'parcel_settings',
      'parcels',
      'tabs',
    ]) {
      expect(tables).toContain(t)
    }
  })

  it('명세 컬럼이 존재한다 (tabs 소프트 클로즈/딜리트·updated_by, parcels coordinates NOT NULL jsonb)', () => {
    const tabCols = sql(
      "select column_name from information_schema.columns where table_schema='public' and table_name='tabs'",
    ).map((r) => r[0])
    for (const c of [
      'tab_id',
      'name',
      'sort_order',
      'closed_at',
      'history_deleted_at',
      'created_at',
      'updated_by',
      'updated_at',
    ]) {
      expect(tabCols).toContain(c)
    }

    const settingCols = sql(
      "select column_name from information_schema.columns where table_schema='public' and table_name='parcel_settings'",
    ).map((r) => r[0])
    for (const c of [
      'tab_id',
      'parcel_local_id',
      'color',
      'style',
      'name',
      'memo',
      'pinned',
      'icon',
      'updated_by',
      'updated_at',
    ]) {
      expect(settingCols).toContain(c)
    }

    const [coordinates] = sql(
      "select is_nullable, data_type from information_schema.columns where table_schema='public' and table_name='parcels' and column_name='coordinates'",
    )
    expect(coordinates).toEqual(['NO', 'jsonb'])
  })

  it('PK가 명세와 일치한다 (parcel_settings는 (tab_id, parcel_local_id) 복합)', () => {
    const rows = sql(
      `select tc.table_name, kcu.column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
       where tc.table_schema='public' and tc.constraint_type='PRIMARY KEY'
       order by tc.table_name, kcu.ordinal_position`,
    )
    const pk: Record<string, string[]> = {}
    for (const [table, column] of rows) {
      pk[table] = [...(pk[table] ?? []), column]
    }
    expect(pk.tabs).toEqual(['tab_id'])
    expect(pk.parcels).toEqual(['local_id'])
    expect(pk.parcel_settings).toEqual(['tab_id', 'parcel_local_id'])
    expect(pk.parcel_groups).toEqual(['group_id'])
    expect(pk.color_labels).toEqual(['color_id'])
    expect(pk.app_config).toEqual(['key'])
  })

  it('FK가 명세와 일치한다 (tabs 참조는 ON DELETE CASCADE)', () => {
    const rows = sql(
      `select tc.table_name, kcu.column_name, ccu.table_name, rc.delete_rule
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
       join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
       join information_schema.referential_constraints rc on tc.constraint_name = rc.constraint_name
       where tc.table_schema='public' and tc.constraint_type='FOREIGN KEY'`,
    ).map(([table, column, foreignTable, deleteRule]) => ({
      table,
      column,
      foreignTable,
      deleteRule,
    }))
    expect(rows).toContainEqual({
      table: 'parcel_settings',
      column: 'tab_id',
      foreignTable: 'tabs',
      deleteRule: 'CASCADE',
    })
    expect(rows).toContainEqual({
      table: 'parcel_settings',
      column: 'parcel_local_id',
      foreignTable: 'parcels',
      deleteRule: 'NO ACTION',
    })
    expect(rows).toContainEqual({
      table: 'parcel_groups',
      column: 'tab_id',
      foreignTable: 'tabs',
      deleteRule: 'CASCADE',
    })
  })

  it("parcel_settings.style에 CHECK ('fill','border')가 있고, parcels.pnu는 UNIQUE다", () => {
    const checks = sql(
      `select cc.check_clause
       from information_schema.check_constraints cc
       join information_schema.constraint_column_usage ccu on cc.constraint_name = ccu.constraint_name
       where ccu.table_schema='public' and ccu.table_name='parcel_settings' and ccu.column_name='style'`,
    ).map((r) => r[0])
    const styleCheck = checks.find((c) => c.includes('fill') && c.includes('border'))
    expect(styleCheck).toBeDefined()

    const uniques = sql(
      `select kcu.column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
       where tc.table_schema='public' and tc.table_name='parcels' and tc.constraint_type='UNIQUE'`,
    ).map((r) => r[0])
    expect(uniques).toContain('pnu')
  })

  it("color_labels의 REPLICA IDENTITY가 FULL('f')이고 나머지 Realtime 테이블은 default('d')다 (M-6 AC-7)", () => {
    const rows = sql(
      `select relname, relreplident from pg_class
       where relnamespace = 'public'::regnamespace
         and relname in ('color_labels', 'parcel_settings', 'parcel_groups', 'tabs')
       order by relname`,
    )
    const ident: Record<string, string> = {}
    for (const [table, replident] of rows) {
      ident[table] = replident
    }
    expect(ident.color_labels).toBe('f')
    // 명세 사전 결정: settings(복합 PK)·groups(전역 유일 키)·tabs(소프트 클로즈만)는 FULL 불필요
    expect(ident.parcel_settings).toBe('d')
    expect(ident.parcel_groups).toBe('d')
    expect(ident.tabs).toBe('d')
  })

  it('supabase_realtime publication에 4개 테이블이 등록되어 있다', () => {
    const tables = sql(
      "select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename",
    ).map((r) => r[0])
    expect(tables).toEqual(['color_labels', 'parcel_groups', 'parcel_settings', 'tabs'])
  })
})

describe('AC-2: import-parcels — parcels.json 필지 수 일치 + 멱등', () => {
  it('parcels 행 수가 public/data/parcels.json 필지 수(4,409)와 일치한다', async () => {
    const file = JSON.parse(readFileSync(`${root}/public/data/parcels.json`, 'utf-8')) as {
      parcels: unknown[]
    }
    expect(file.parcels.length).toBe(4409)
    expect(await parcelsCount()).toBe(file.parcels.length)
  })

  it('스크립트를 한 번 더 실행해도 행 수가 변하지 않는다 (멱등)', async () => {
    const before = await parcelsCount()
    execSync('pnpm import:parcels', { cwd: root, stdio: 'pipe' })
    expect(await parcelsCount()).toBe(before)
  })
})
