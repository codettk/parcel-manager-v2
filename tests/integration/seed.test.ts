import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runSeed } from '../../scripts/migrate-v1-data'
import type {
  SeedReport,
  V1AppState,
  V1ColorRow,
  V1ConfigRow,
  V1GroupRow,
  V1ParcelRow,
  V1Reader,
  V1SettingRow,
} from '../../scripts/migrate-v1-data'
import { db, pickParcelIds } from './helpers'

/**
 * v1 → v2 시드 통합 테스트.
 * - 쓰기 타깃은 로컬 v2 Supabase(db helper, service role).
 * - 읽기 소스는 인메모리 fixture(FakeV1Reader) — 실 v1 DB 미접근.
 * - 각 테스트 전 비-parcels 상태를 비워(parcels 마스터는 유지) 결정적 카운트를 만든다.
 */

interface V1Fixture {
  parcels?: V1ParcelRow[]
  settings?: V1SettingRow[]
  groups?: V1GroupRow[]
  colors?: V1ColorRow[]
  config?: V1ConfigRow[]
  appState?: V1AppState | null
}

function fakeV1(fx: V1Fixture): V1Reader {
  return {
    parcels: () => Promise.resolve(fx.parcels ?? []),
    parcelSettings: () => Promise.resolve(fx.settings ?? []),
    parcelGroups: () => Promise.resolve(fx.groups ?? []),
    colorLabels: () => Promise.resolve(fx.colors ?? []),
    appConfig: () => Promise.resolve(fx.config ?? []),
    appState: () => Promise.resolve(fx.appState ?? null),
  }
}

async function purgeNonParcels(): Promise<void> {
  // FK CASCADE가 있지만 명시적으로 순서 보장 (parcels 마스터는 비우지 않는다)
  await db.from('parcel_settings').delete().neq('parcel_local_id', '__never__')
  await db.from('parcel_groups').delete().neq('group_id', '__never__')
  await db.from('tabs').delete().neq('tab_id', '__never__')
  await db.from('color_labels').delete().neq('color_id', '__never__')
  await db.from('app_config').delete().neq('key', '__never__')
}

async function countRows(table: string): Promise<number> {
  const res = await db.from(table).select('*', { count: 'exact', head: true })
  if (res.error) throw new Error(res.error.message)
  return res.count ?? 0
}

let PARCELS: string[] = []

/**
 * parcels master에 mutate한 local_id의 원래 (jibun·jibun_full·coordinates·pnu·vworld_fetched_at)
 * 를 기록 → afterAll에서 원복. 풀런 시 첫 필지를 읽는 parcels.test.ts 등 다른 스위트가
 * seed.test.ts의 master 쓰기에 오염되지 않도록 격리한다.
 */
interface ParcelMasterSnapshot {
  local_id: string
  jibun: string | null
  jibun_full: string | null
  coordinates: unknown
  pnu: string | null
  vworld_fetched_at: string | null
}
const MASTER_RESTORE = new Map<string, ParcelMasterSnapshot>()

async function snapshotMaster(localId: string): Promise<ParcelMasterSnapshot> {
  const { data, error } = await db
    .from('parcels')
    .select('local_id, jibun, jibun_full, coordinates, pnu, vworld_fetched_at')
    .eq('local_id', localId)
    .single()
  if (error) throw new Error(error.message)
  return data as ParcelMasterSnapshot
}

/** mutate 전 원본을 1회만 캡처(이후 호출은 무시 — 최초 상태 보존) */
async function rememberMaster(...localIds: string[]): Promise<void> {
  for (const id of localIds) {
    if (MASTER_RESTORE.has(id)) continue
    MASTER_RESTORE.set(id, await snapshotMaster(id))
  }
}

beforeEach(async () => {
  await purgeNonParcels()
  PARCELS = await pickParcelIds(6)
})

afterAll(async () => {
  // master 쓰기 원복 (격리) — 다른 통합 스위트가 첫 필지의 master 컬럼을 읽으므로 필수
  for (const snap of MASTER_RESTORE.values()) {
    const { error } = await db
      .from('parcels')
      .update({
        jibun: snap.jibun,
        jibun_full: snap.jibun_full,
        coordinates: snap.coordinates,
        pnu: snap.pnu,
        vworld_fetched_at: snap.vworld_fetched_at,
      })
      .eq('local_id', snap.local_id)
    if (error) throw new Error(`master 원복 실패 (${snap.local_id}): ${error.message}`)
  }
  MASTER_RESTORE.clear()
})

describe('AC-1: parcels 보강 — 폐기 3컬럼 제외, pnu·vworld_fetched_at 보존, jibun·coordinates 불변', () => {
  it('v2 기존 행에 pnu·vworld만 update하고 jibun·coordinates는 그대로, 폐기 3컬럼은 복사하지 않는다', async () => {
    const [p1, p2] = PARCELS
    // 시드 전 master의 jibun·coordinates를 캡처 → 이후 불변 단언(NB-2 회귀 가드) + afterAll 원복
    await rememberMaster(p1, p2)
    const before1 = MASTER_RESTORE.get(p1) as ParcelMasterSnapshot
    const before2 = MASTER_RESTORE.get(p2) as ParcelMasterSnapshot
    // master는 import로 jibun이 채워져 있어야 한다(전제 — 이게 보존 대상)
    expect(before1.jibun).toBeTruthy()
    expect(before1.coordinates).toBeTruthy()

    const fetchedAt = '2026-01-02T03:04:05.000Z'
    // fixture는 jibun·jibun_full·coordinates를 일부러 다른 값/누락으로 줘서,
    // 시드가 master의 지번/좌표를 절대 덮어쓰지 않음을 검증한다.
    const report = await runSeed(
      fakeV1({
        parcels: [
          {
            local_id: p1,
            pnu: '4159025021100010000',
            jibun: 'WRONG-지번', // ← master에 절대 반영되면 안 됨
            jibun_full: 'WRONG-전체지번',
            coordinates: [[999, 999]], // ← master coordinates 덮어쓰면 안 됨
            vworld_fetched_at: fetchedAt,
            lndcgr_code_nm: '전',
            lad_frtl_sc: 'X',
            lad_frtl_sc_nm: 'Y',
            last_updt_dt: '2020-01-01',
          },
          {
            local_id: p2,
            pnu: '4159025021100020000',
            jibun: null, // ← null로도 master jibun을 NULL로 만들면 안 됨
            vworld_fetched_at: fetchedAt,
            lad_frtl_sc: 'Z',
          },
        ],
      }),
      db,
      { dryRun: false, force: false },
    )
    expect(report.parcels.v1).toBe(2)
    expect(report.parcels.upserted).toBe(2)

    const { data, error } = await db
      .from('parcels')
      .select('local_id, pnu, vworld_fetched_at, lndcgr_code_nm, jibun, jibun_full, coordinates')
      .in('local_id', [p1, p2])
    expect(error).toBeNull()
    const byId = new Map((data ?? []).map((r) => [r.local_id as string, r]))
    // pnu·V-World는 채워졌다
    expect(byId.get(p1)?.pnu).toBe('4159025021100010000')
    expect(byId.get(p2)?.pnu).toBe('4159025021100020000')
    // timestamptz는 +00:00 형식으로 round-trip — 시각 동등성으로 비교
    expect(new Date(byId.get(p1)?.vworld_fetched_at as string).toISOString()).toBe(fetchedAt)
    expect(byId.get(p1)?.lndcgr_code_nm).toBe('전')
    // jibun·jibun_full·coordinates는 시드 전과 동일 (NB-2 회귀 가드)
    expect(byId.get(p1)?.jibun).toBe(before1.jibun)
    expect(byId.get(p1)?.jibun_full).toBe(before1.jibun_full)
    expect(byId.get(p1)?.coordinates).toEqual(before1.coordinates)
    expect(byId.get(p2)?.jibun).toBe(before2.jibun) // null fixture에도 master jibun 보존
    expect(byId.get(p2)?.coordinates).toEqual(before2.coordinates)
    // 폐기 컬럼은 v2 스키마에 없으므로 select 자체가 불가 — 매핑 객체 키에 없음을 확인
    const sel = await db.from('parcels').select('lad_frtl_sc').eq('local_id', p1)
    expect(sel.error).not.toBeNull() // v2 스키마에 컬럼 없음
  })
})

describe('AC-2: overrides 권위 규칙 (app_state.parcels 우선)', () => {
  it('app_state.parcels가 비어있지 않으면 그것이 권위, 비었으면 parcel_settings를 따른다', async () => {
    const [p1] = PARCELS
    // app_state 우선
    const r1 = await runSeed(
      fakeV1({
        appState: { parcels: { [p1]: { color: 'eco' } } },
        settings: [{ parcel_local_id: p1, color: 'rose' }],
      }),
      db,
      { dryRun: false, force: false },
    )
    expect(r1.overrides.authority).toBe('app_state.parcels')
    const after1 = await db
      .from('parcel_settings')
      .select('color')
      .eq('parcel_local_id', p1)
      .single()
    expect(after1.data?.color).toBe('eco')

    // app_state 빈 경우 → parcel_settings
    await purgeNonParcels()
    const r2 = await runSeed(
      fakeV1({
        appState: { parcels: {} },
        settings: [{ parcel_local_id: p1, color: 'rose' }],
      }),
      db,
      { dryRun: false, force: false },
    )
    expect(r2.overrides.authority).toBe('parcel_settings')
    const after2 = await db
      .from('parcel_settings')
      .select('color')
      .eq('parcel_local_id', p1)
      .single()
    expect(after2.data?.color).toBe('rose')
  })
})

describe('AC-3: 의미 없는 override 생략 (isClearedOverride 동형)', () => {
  it('빈 override는 생략하고 color 있는 행만 INSERT', async () => {
    const [p1, p2] = PARCELS
    const report = await runSeed(
      fakeV1({
        settings: [
          { parcel_local_id: p1, color: null, name: '', memo: '', pinned: false, icon: '' },
          { parcel_local_id: p2, color: 'rose' },
        ],
      }),
      db,
      { dryRun: false, force: false },
    )
    expect(report.overrides.inserted).toBe(1)
    expect(report.overrides.omitted).toBe(1)
    const rows = await db.from('parcel_settings').select('parcel_local_id')
    expect((rows.data ?? []).map((r) => r.parcel_local_id)).toEqual([p2])
  })
})

describe('AC-4: pinned·icon 보존', () => {
  it('pinned=true·icon이 v2 행에 보존된다', async () => {
    const [p1] = PARCELS
    const report = await runSeed(
      fakeV1({ settings: [{ parcel_local_id: p1, pinned: true, icon: 'star' }] }),
      db,
      { dryRun: false, force: false },
    )
    expect(report.overrides.pinned).toBe(1)
    const row = await db
      .from('parcel_settings')
      .select('pinned, icon')
      .eq('parcel_local_id', p1)
      .single()
    expect(row.data?.pinned).toBe(true)
    expect(row.data?.icon).toBe('star')
  })
})

describe('AC-5: 빈 그룹명 → null 정규화, tab_id=기본 탭', () => {
  it("name=''→null, name='논'→'논', 둘 다 기본 탭", async () => {
    const [p1, p2] = PARCELS
    const report = await runSeed(
      fakeV1({
        groups: [
          { group_id: 'g_empty', name: '', parcel_ids: [p1] },
          { group_id: 'g_rice', name: '논', parcel_ids: [p2] },
        ],
      }),
      db,
      { dryRun: false, force: false },
    )
    expect(report.groups.inserted).toBe(2)
    expect(report.groups.emptyNameNormalized).toBe(1)
    const tabId = report.defaultTab.tabId
    const rows = await db.from('parcel_groups').select('group_id, name, tab_id')
    const byId = new Map((rows.data ?? []).map((r) => [r.group_id as string, r]))
    expect(byId.get('g_empty')?.name).toBeNull()
    expect(byId.get('g_rice')?.name).toBe('논')
    expect(byId.get('g_empty')?.tab_id).toBe(tabId)
    expect(byId.get('g_rice')?.tab_id).toBe(tabId)
  })
})

describe('AC-6: color_labels hex 보충 + 레거시 폴백', () => {
  it('hex 없는 v1 색은 기본 6색 보충, label·sort_order는 v1 값', async () => {
    const report = await runSeed(
      fakeV1({ colors: [{ color_id: 'eco', label: '친환경커스텀', hex: null, sort_order: 3 }] }),
      db,
      { dryRun: false, force: false },
    )
    expect(report.colors.hexBackfilled).toBe(1)
    const row = await db
      .from('color_labels')
      .select('label, hex, sort_order')
      .eq('color_id', 'eco')
      .single()
    expect(row.data?.label).toBe('친환경커스텀')
    expect(row.data?.sort_order).toBe(3)
    expect(row.data?.hex).toBe('#6CA945') // 기본 6색 보충
  })

  it('v1 color_labels 비고 app_state.color_labels 레거시 맵만 있으면 폴백', async () => {
    const report = await runSeed(
      fakeV1({ colors: [], appState: { color_labels: { mycolor: '내색상' } } }),
      db,
      { dryRun: false, force: false },
    )
    expect(report.colors.legacyFallback).toBe(true)
    const row = await db
      .from('color_labels')
      .select('label, hex')
      .eq('color_id', 'mycolor')
      .single()
    expect(row.data?.label).toBe('내색상')
    expect(row.data?.hex).toBe('#888888') // 기본 6색 아님 → 최종 폴백 hex
  })
})

describe('AC-7: reset_snapshots → 닫힌 탭, group_id 전부 재생성', () => {
  it('스냅샷 2개가 닫힌 탭 2개로, overrides·groups가 이관되고 group_id가 모두 달라진다', async () => {
    const [p1, p2, p3] = PARCELS
    const report = await runSeed(
      fakeV1({
        config: [
          {
            key: 'reset_snapshots',
            value: [
              {
                label: '스냅A',
                createdAt: '2026-02-01T00:00:00.000Z',
                data: {
                  overrides: { [p1]: { color: 'rose' } },
                  groups: { oldg1: { name: '밭', color: 'eco', parcelIds: [p1] } },
                },
              },
              {
                label: '스냅B',
                createdAt: '2026-03-01T00:00:00.000Z',
                data: {
                  overrides: { [p2]: { color: 'sky' }, [p3]: { name: '메모필지' } },
                  groups: { oldg2: { name: '', parcelIds: [p2, p3] } },
                },
              },
            ],
          },
        ],
      }),
      db,
      { dryRun: false, force: false },
    )
    expect(report.snapshots).toHaveLength(2)
    expect(report.snapshots[0].label).toBe('스냅A')
    expect(report.snapshots[1].label).toBe('스냅B')

    // 닫힌 탭 2개
    const closed = await db
      .from('tabs')
      .select('tab_id, name, closed_at')
      .not('closed_at', 'is', null)
    const closedByName = new Map((closed.data ?? []).map((r) => [r.name as string, r]))
    expect(closedByName.get('스냅A')?.closed_at).not.toBeNull()
    expect(new Date(closedByName.get('스냅A')?.closed_at as string).toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    )
    expect(new Date(closedByName.get('스냅B')?.closed_at as string).toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    )

    // group_id 전부 재생성 (v1 키 oldg1·oldg2가 v2에 존재하지 않음)
    const groups = await db.from('parcel_groups').select('group_id, name')
    const ids = (groups.data ?? []).map((r) => r.group_id as string)
    expect(ids).not.toContain('oldg1')
    expect(ids).not.toContain('oldg2')
    expect(ids.every((id) => id.startsWith('grp_'))).toBe(true)
    // 빈 그룹명 정규화도 스냅샷에 적용
    const names = (groups.data ?? []).map((r) => r.name)
    expect(names).toContain(null)
    expect(names).toContain('밭')

    // 스냅B overrides 2개 이관 확인
    const tabB = closedByName.get('스냅B')?.tab_id as string
    const settingsB = await countRowsInTab('parcel_settings', tabB)
    expect(settingsB).toBe(2)
  })
})

async function countRowsInTab(table: string, tabId: string): Promise<number> {
  const res = await db.from(table).select('*', { count: 'exact', head: true }).eq('tab_id', tabId)
  if (res.error) throw new Error(res.error.message)
  return res.count ?? 0
}

describe('AC-8: dry-run은 쓰기 0회, 카운트는 실적재와 일치', () => {
  it('dryRun=true는 DB 행 수를 바꾸지 않고 SeedReport 카운트가 실적재와 같다', async () => {
    const [p1, p2] = PARCELS
    const fx: V1Fixture = {
      settings: [
        { parcel_local_id: p1, color: 'rose', pinned: true, icon: 'star' },
        { parcel_local_id: p2, color: null, name: '', pinned: false }, // 생략 대상
      ],
      groups: [{ group_id: 'g1', name: '', parcel_ids: [p1] }],
      colors: [{ color_id: 'eco', label: '친환경', hex: '#6CA945', sort_order: 0 }],
      config: [{ key: 'calc_recipes', value: [{ id: 'r1' }, { id: 'r2' }] }],
    }

    const before = {
      settings: await countRows('parcel_settings'),
      groups: await countRows('parcel_groups'),
      tabs: await countRows('tabs'),
      colors: await countRows('color_labels'),
    }
    const dryReport = await runSeed(fakeV1(fx), db, { dryRun: true, force: false })
    const after = {
      settings: await countRows('parcel_settings'),
      groups: await countRows('parcel_groups'),
      tabs: await countRows('tabs'),
      colors: await countRows('color_labels'),
    }
    expect(after).toEqual(before) // 쓰기 0회

    // 동일 fixture로 실적재
    await purgeNonParcels()
    const realReport = await runSeed(fakeV1(fx), db, { dryRun: false, force: false })

    expect(dryReport.overrides.inserted).toBe(realReport.overrides.inserted)
    expect(dryReport.overrides.omitted).toBe(realReport.overrides.omitted)
    expect(dryReport.overrides.pinned).toBe(realReport.overrides.pinned)
    expect(dryReport.groups.inserted).toBe(realReport.groups.inserted)
    expect(dryReport.groups.emptyNameNormalized).toBe(realReport.groups.emptyNameNormalized)
    expect(dryReport.colors.inserted).toBe(realReport.colors.inserted)
    expect(dryReport.calcRecipes).toBe(realReport.calcRecipes)
    expect(realReport.overrides.inserted).toBe(1)
    expect(realReport.calcRecipes).toBe(2)
  })
})

describe('AC-9: 재실행 가드 + --force', () => {
  it('force=false는 시드 흔적이 있으면 거부, force=true는 비우고 재적재', async () => {
    const [p1, p2] = PARCELS
    // 1차 시드
    await runSeed(fakeV1({ settings: [{ parcel_local_id: p1, color: 'rose' }] }), db, {
      dryRun: false,
      force: false,
    })
    const settingsBefore = await countRows('parcel_settings')
    const parcelsBefore = await countRows('parcels')
    expect(settingsBefore).toBe(1)

    // force 없이 재실행 → 거부, 데이터 불변
    await expect(
      runSeed(fakeV1({ settings: [{ parcel_local_id: p2, color: 'sky' }] }), db, {
        dryRun: false,
        force: false,
      }),
    ).rejects.toThrow(/이미 시드/)
    expect(await countRows('parcel_settings')).toBe(settingsBefore)

    // force=true → 비우고 재적재, parcels 마스터는 줄지 않음
    const forceReport: SeedReport = await runSeed(
      fakeV1({ settings: [{ parcel_local_id: p2, color: 'sky' }] }),
      db,
      { dryRun: false, force: true },
    )
    expect(forceReport.overrides.inserted).toBe(1)
    const rows = await db.from('parcel_settings').select('parcel_local_id, color')
    expect((rows.data ?? []).map((r) => r.parcel_local_id)).toEqual([p2])
    expect((rows.data ?? [])[0]?.color).toBe('sky')
    expect(await countRows('parcels')).toBe(parcelsBefore) // parcels 마스터 유지
  })
})
