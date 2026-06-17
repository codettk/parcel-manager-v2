import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import type { MeResponse } from '../../../src/types/api/auth'
import type { CalcRecipe } from '../../../src/types/api/calcRecipes'
import type { ColorLabel } from '../../../src/types/api/colors'
import type { TabStateResponse } from '../../../src/types/api/tabState'

// E2E 공용 /api 모킹 헬퍼 — webServer는 vite 단독(5173)이라 /api(3000 프록시)는 502가 된다.
// M-5 이후 탭 선택은 스토어 boot 완료(C-4 isInitializing 해제)가 전제이므로,
// 모든 spec이 이 모킹으로 부팅 시퀀스를 통과시킨다.
// 응답은 src/types/api/ zod 스키마(tabSchema·colorLabelSchema·tabStateResponseSchema)와
// 동형이어야 api 클라이언트 parse를 통과한다.
// (파일명이 *.spec.ts가 아니므로 playwright testMatch에 걸리지 않는다)

export const TAB_ID = 'tab-e2e'
// M-16 탭 작업공간 — AC-1(탭 격리)이 필요로 하는 두 번째 활성 탭. opts.tabs:2일 때만 합류한다
// (다른 spec은 기본 탭 1개만 쓰므로 기존 단일 탭 동작 보존).
export const TAB_B_ID = 'tab-e2e-b'
const NOW = '2026-06-11T00:00:00.000Z'

interface TabFixture {
  tabId: string
  name: string
  sortOrder: number
  closedAt: string | null
  createdAt: string
  updatedBy: string | null
  updatedAt: string
}

function makeTab(tabId: string, name: string, sortOrder: number): TabFixture {
  return { tabId, name, sortOrder, closedAt: null, createdAt: NOW, updatedBy: null, updatedAt: NOW }
}

const TAB_A_FIXTURE = makeTab(TAB_ID, '기본', 0)
const TAB_B_FIXTURE = makeTab(TAB_B_ID, '두번째', 1)

// M-16 히스토리 — opts.history:true일 때만 GET /api/history가 반환하는 닫힌 탭 2개.
// closedAt 내림차순(AC-6) 검증을 위해 H2가 H1보다 최근에 닫혔다.
export const HISTORY_H1_ID = 'tab-hist-1'
export const HISTORY_H2_ID = 'tab-hist-2'
export const HISTORY_H1_NAME = '닫힌 작업 하나'
export const HISTORY_H2_NAME = '닫힌 작업 둘'
const HISTORY_H1_CLOSED_AT = '2026-06-10T08:00:00.000Z'
const HISTORY_H2_CLOSED_AT = '2026-06-12T09:30:00.000Z' // 더 최근 — 목록 첫 행
// 복원 시 새 탭으로 부여되는 id (POST /api/history/:id/restore 응답). C-3: group_id 전부 재생성
export const RESTORED_TAB_ID = 'tab-restored'

// 팔레트 hex는 DB(color_labels) 소관 — 검증용으로 채도 극단의 두 색을 사용해
// 합성 결과가 지도 기본색(흰 채움·회 테두리·배경·선택 강조 #1F5A38)과 절대 겹치지 않게 한다
export const PARCEL_HEX = '#FF0000' // 개별 필지 override(style=fill)
export const GROUP_HEX = '#0000FF' // 그룹(style=fill)

export const COLORS_FIXTURE: ColorLabel[] = [
  { colorId: 'c-red', label: '빨강', hex: PARCEL_HEX, sortOrder: 0 },
  { colorId: 'c-blue', label: '파랑', hex: GROUP_HEX, sortOrder: 1 },
]

// 필지 id는 public/data/parcels.json의 실제 id여야 렌더된다 — 면적 상위 필지를 골라
// 초기 fit(전체 보기)에서도 합성 픽셀이 확실히 출현하게 한다
interface RawParcel {
  id: string
  jibun: string
  c: [number, number][]
}

function shoelace(c: [number, number][]): number {
  let a = 0
  for (let i = 0; i < c.length; i++) {
    const [x1, y1] = c[i]
    const [x2, y2] = c[(i + 1) % c.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a / 2)
}

const rawData = JSON.parse(
  readFileSync(new URL('../../../public/data/parcels.json', import.meta.url), 'utf-8'),
) as { parcels: RawParcel[] }
const byAreaDesc = [...rawData.parcels].sort((a, b) => shoelace(b.c) - shoelace(a.c))
export const RED_PARCEL_ID = byAreaDesc[0].id
export const GROUP_MEMBER_IDS = [byAreaDesc[1].id, byAreaDesc[2].id]

// M-13 V-World 토지정보 — pnu 있고 미조회(vworldFetchedAt null)인 필지.
// 다른 spec이 쓰는 RED_PARCEL_ID·GROUP_MEMBER_IDS와 겹치지 않게 별도 필지를 고른다
// (회귀 격리: 이 필지만 GET 단건 조회에서 pnu가 채워진다).
export const PNU_PARCEL_ID = byAreaDesc[3].id

// M-15 초기화 — pinned(고정)+color 보유 필지. 기본 픽스처엔 없고 reset.spec만 opt-in으로 켠다
// (다른 spec의 override 집합·합성 픽셀 단언을 그대로 보존). 색은 c-blue(GROUP_HEX) —
// RED_PARCEL_ID(c-red, 비고정)와 합성색이 달라 "빨강 소실 ∥ 파랑 유지"를 독립 검증할 수 있다.
export const PINNED_PARCEL_ID = byAreaDesc[4].id
// V-World 조회 성공 시 fetch-land-info가 반환하는 갱신 행의 지목명 (카드 검증용 리터럴)
export const LAND_INFO_LNDCGR_NM = '전'

const RAW_BY_ID = new Map(rawData.parcels.map((p) => [p.id, p]))

/** 탭된 필지의 실제 지번 (parcels.json 기반) — 시트 헤더 검증용 */
export function jibunOf(parcelId: string): string | null {
  return RAW_BY_ID.get(parcelId)?.jibun ?? null
}

// M-14 지목 필터 — 지번 끝글자 휴리스틱(src/features/map/jimok.ts classifyJimok 보존).
// E2E(AC-9)는 '답' 분류 필지를 목록 검색으로 결정적으로 열어야 하므로,
// jibun이 다른 행과 부분일치하지 않는('검색 시 유일') '답' 필지를 picksJSON에서 도출한다
// (RED_PARCEL_ID 선례 — id 하드코딩 대신 parcels.json에서 산출해 데이터 변화에 견고).
function classifyDap(jibun: string): boolean {
  return jibun.slice(-1) === '답'
}
const SUBSTRING_COUNT = (() => {
  const m = new Map<string, number>()
  for (const p of rawData.parcels) m.set(p.jibun, (m.get(p.jibun) ?? 0) + 1)
  return m
})()
function uniqueSubstringJibun(jibun: string): boolean {
  // 부분 일치 검색이 정확히 이 행 하나만 남기는지 — 다른 어떤 지번에도 부분문자열로 들지 않아야 한다
  if ((SUBSTRING_COUNT.get(jibun) ?? 0) !== 1) return false
  return rawData.parcels.filter((p) => p.jibun.includes(jibun)).length === 1
}
const DAP_PARCEL = rawData.parcels.find(
  (p) => classifyDap(p.jibun) && uniqueSubstringJibun(p.jibun),
)
if (DAP_PARCEL === undefined) throw new Error('parcels.json에 검색 유일한 답 필지가 없음 (e2e)')
/** '답' 분류 + 지번 부분일치 검색 유일 필지 (AC-9 시트 결정적 열기용) */
export const DAP_PARCEL_ID = DAP_PARCEL.id
export const DAP_PARCEL_JIBUN = DAP_PARCEL.jibun

// GET /api/parcels/:id 픽스처 면적(㎡) — 시트 면적 행 렌더 조건(lndpclAr != null) 충족용
const PARCEL_FIXTURE_AREA_M2 = 1234.5

export const PARCEL_COUNT = rawData.parcels.length

// M-9 목록 면적 일괄 조회(GET /api/parcel-areas) 픽스처 —
// parcelAreasResponseSchema(Record<localId, number | null>) 동형.
// 대부분 null + 일부만 고유 실수 면적: '-' 아닌 환산 표시(AC-10)와 행 특정(AC-11)을 겸한다
export const LIST_AREAS_M2: Record<string, number> = {
  [RED_PARCEL_ID]: 2345.6,
  [GROUP_MEMBER_IDS[0]]: 678.9,
}
const PARCEL_AREAS_FIXTURE: Record<string, number | null> = Object.fromEntries(
  rawData.parcels.map((p) => [p.id, LIST_AREAS_M2[p.id] ?? null]),
)

// M-10 자동 계산기 레시피 픽스처 — calculator.spec.ts가 환산값을 리터럴로 단언한다:
// 개별 1234.5㎡(단건 조회 픽스처) → (1234.5/300)×20 = 82.3 kg,
// 그룹(멤버 2) 합산 2469㎡ → (2469/300)×20 = 164.6 kg
export const CALC_RECIPE_FIXTURE: CalcRecipe = {
  id: 'r-e2e-lime',
  name: '석회',
  baseArea: 300,
  baseUnit: '㎡',
  amount: 20,
  amountUnit: 'kg',
}

export interface MockApiOptions {
  /** GET /api/calc-recipes 초기값 — null(기본) = 미설정. PUT이 이후 GET 응답을 덮는다 (서버 단일 소스 동형) */
  calcRecipes?: CalcRecipe[] | null
  /**
   * M-15 초기화 — true면 PINNED_PARCEL_ID(pinned=true, color=c-blue)를 초기 overrides에 추가하고
   * 기본 파랑 그룹은 제거한다. 그러면 파랑 합성 픽셀의 출처가 pinned 필지 단 하나라
   * reset(['color']) 후에도 파랑이 남는지로 "pinned 보호"를 군더더기 없이 격리 검증할 수 있다
   * (그룹이 있으면 그룹도 파랑이라 pinned vs 그룹을 색만으로 구분 불가).
   * 기본 false(다른 spec 회귀 격리). POST /api/tabs/:id/reset은 항상 {ok:true} —
   * pinned 보호·비고정 color 비움은 workspace 스토어의 낙관적 로컬 정리가 수행한다(서버 동형).
   */
  withPinnedParcel?: boolean
  /**
   * M-16 탭 작업공간 — 활성 탭 수. 1(기본) = 단일 탭(기존 spec 회귀 보존).
   * 2 = TAB_ID(A, 기본 픽스처 상태) + TAB_B_ID(B, 빈 상태)로 AC-1 탭 격리를 검증한다.
   * 탭별 tabState는 per-tab 가변 맵으로 분기되며 POST upsert가 해당 탭에만 반영된다.
   */
  tabs?: 1 | 2
  /** M-16 히스토리 — true면 GET /api/history가 닫힌 탭 2개(H1·H2)를 반환한다. 기본 false */
  history?: boolean
  /**
   * region 진입 게이트 — 기본 true면 부팅 전 localStorage에 활성 region(SEED)을 주입해
   * 지도로 직행한다(기존 e2e 회귀 보존). false면 빈 상태로 시작해 게이트 화면을 검증한다
   * (region-entry.spec 전용). 정확한 키·id는 src/stores/ui.ts·regionCatalog.ts 권위.
   */
  seedRegion?: boolean
  /**
   * 인증 게이트(auth-accounts) — 기본 true면 부팅 전 authed 세션을 시드하고 /api/config가
   * 가짜 supabase 구성을 내려 LoginView를 건너뛰고 region 게이트→지도로 진행한다
   * (인증 게이트가 region보다 앞서므로 기존 e2e 전부 이 시드가 필요). false면 세션 없이
   * 시작해 /api/config도 빈 {}를 반환 → authStatus='anon' → LoginView를 검증한다(auth spec 전용).
   */
  seedAuth?: boolean
  /**
   * 슬라이스 4 GPS 역지오코딩 — POST /api/geocode/reverse 응답 모킹.
   * - 미지정(기본): 라우트 미등록 → 호출 시 404(모킹 누락). GPS를 안 쓰는 spec은 영향 없음
   *   (geolocation을 안 쓰거나 권한 거부로 모킹하면 geocode 호출 자체가 일어나지 않는다).
   * - { area }: 200 + reverseGeocodeResponseSchema 동형. area=null이면 무매칭 분기(AC-5·11).
   * - { status }: 503(키 부재, AC-13)·502(외부 실패, AC-13) 에러를 반환.
   * 좌표·clientId는 본문 그대로 받되 응답에 에코하지 않는다(절충 3 동형).
   */
  geocode?:
    | { area: { sido: string; sigungu: string; emd: string } | null }
    | { status: number }
}

/** src/stores/ui.ts ACTIVE_REGION_STORAGE_KEY · regionCatalog SEED_REGION.id 와 일치해야 한다 */
export const ACTIVE_REGION_STORAGE_KEY = 'pilji_v2_active_region'
export const SEED_REGION_ID = 'incheon-ganghwa-hwado'
/** 슬라이스 3 샘플 적재 region (regionData = /data/regions/<id>.json). backend-dev 데이터셋과 동일 id */
export const SAMPLE_REGION_ID = 'gyeonggi-gimpo-daegot'
/** 준비 중(loaded=false) region — 받기 불가·지도 미전환(AC-17) */
export const UPCOMING_REGION_ID = 'incheon-ganghwa-ganghwa'

/**
 * GET /api/regions 카탈로그 픽스처 (regionsResponseSchema 동형) — 적재 2 + 준비중 1.
 * 클라이언트 SEED_CATALOG와 동형 분류라 서버 응답/폴백 어느 쪽이든 게이트가 같게 동작한다.
 */
export const REGIONS_CATALOG_FIXTURE = [
  {
    id: SEED_REGION_ID,
    sido: '인천광역시',
    sigungu: '강화군',
    emd: '화도면',
    displayName: '인천 강화군 화도면(보구곶)',
    shortName: '화도면(보구곶)',
    loaded: true,
    parcelCount: 4409,
    sizeLabel: '4.2MB',
    sortOrder: 0,
  },
  {
    id: SAMPLE_REGION_ID,
    sido: '경기도',
    sigungu: '김포시',
    emd: '대곶면',
    displayName: '경기 김포시 대곶면',
    shortName: '대곶면',
    loaded: true,
    parcelCount: 2980,
    sizeLabel: '9.1MB',
    sortOrder: 1,
  },
  {
    id: UPCOMING_REGION_ID,
    sido: '인천광역시',
    sigungu: '강화군',
    emd: '강화읍',
    displayName: '인천 강화군 강화읍',
    shortName: '강화읍',
    loaded: false,
    parcelCount: 3180,
    sizeLabel: '9.1MB',
    sortOrder: 2,
  },
]

/**
 * region 진입 게이트 우회 — 부팅 전 활성 region(SEED)을 localStorage에 주입한다.
 * mockApi를 거치지 않고 자체 page.route를 까는 spec(여정 다중 페이지 등)이
 * 지도로 직행하도록 goto 전에 호출한다.
 */
export async function seedActiveRegion(page: Page) {
  await page.addInitScript(
    ([key, id]) => {
      localStorage.setItem(key, id)
    },
    [ACTIVE_REGION_STORAGE_KEY, SEED_REGION_ID] as const,
  )
}

// ── 인증 세션 시드 (auth-accounts 슬라이스) ──────────────────────────────────
// 인증 게이트(App.tsx)가 region 게이트보다 앞선다 → 기존 e2e가 LoginView에 막히지 않도록
// 부팅 전 authed 세션을 시드한다. seam은 코드 변경 없이:
//   1) /api/config가 가짜 supabase url/anonKey를 내려 getSupabaseClient()가 실 클라이언트를 만들고
//   2) supabase-js가 읽는 localStorage 세션 키(sb-<host첫토큰>-auth-token)에 만료 안 된 세션을 심으면
//      client.auth.getSession()이 네트워크 없이 그 세션을 복원한다(_isValidSession: access_token·
//      refresh_token·expires_at 보유 + 미만료).
//   3) GET /api/me가 meResponseSchema 정형을 반환한다.
// 가짜 supabase 도메인 요청(로그아웃 등)은 mockApi가 함께 가로채 무해 처리한다.

/** 가짜 supabase URL — host 첫 토큰('e2e-test')이 세션 스토리지 키 접두사가 된다 */
export const FAKE_SUPABASE_URL = 'https://e2e-test.supabase.co'
const FAKE_SUPABASE_ANON_KEY = 'e2e-anon-key'
/** supabase-js v2 세션 스토리지 키: sb-${new URL(url).hostname.split('.')[0]}-auth-token */
export const SUPABASE_SESSION_STORAGE_KEY = 'sb-e2e-test-auth-token'
/** 시드 세션의 user_id — /api/me userId와 일치(meResponseSchema.userId가 uuid) */
export const SEED_USER_ID = '00000000-0000-4000-8000-000000000001'

export const ME_FIXTURE: MeResponse = {
  userId: SEED_USER_ID,
  provider: 'kakao',
  displayName: '테스트 사용자',
  avatarUrl: null,
  email: 'tester@example.com',
}

/**
 * 부팅 전 authed supabase 세션을 localStorage에 주입한다(만료 1년 뒤 — getSession 오프라인 복원).
 * seedAuth!==false인 mockApi/journey가 goto 전에 부른다. 신규 auth spec은 호출하지 않아 anon 게이트를 검증.
 */
export async function seedAuthedSession(page: Page) {
  await page.addInitScript(
    ([key, userId]) => {
      const farFuture = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
      const session = {
        access_token: 'e2e-access-token',
        refresh_token: 'e2e-refresh-token',
        expires_at: farFuture,
        expires_in: 365 * 24 * 60 * 60,
        token_type: 'bearer',
        user: {
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'tester@example.com',
          app_metadata: { provider: 'kakao' },
          user_metadata: {},
          created_at: '2026-01-01T00:00:00.000Z',
        },
      }
      localStorage.setItem(key, JSON.stringify(session))
    },
    [SUPABASE_SESSION_STORAGE_KEY, SEED_USER_ID] as const,
  )
}

const TAB_STATE_FIXTURE: TabStateResponse = {
  overrides: {
    [RED_PARCEL_ID]: {
      color: 'c-red',
      style: 'fill',
      name: null,
      memo: null,
      pinned: false,
      icon: null,
    },
  },
  groups: {
    'g-e2e': {
      name: '파랑 그룹',
      memo: null,
      color: 'c-blue',
      style: 'fill',
      parcelIds: GROUP_MEMBER_IDS,
    },
  },
}

/**
 * 부팅 시퀀스(src/stores/workspace.ts boot: GET /api/tabs ∥ /api/colors → /api/tabs/:id/state) 모킹.
 * 글롭 '**\/api\/**'는 vite 모듈 URL(/src/types/api/* 등)까지 가로채 앱 로드를 깨므로
 * pathname 접두사 술어로 API 요청만 매칭한다.
 */
export async function mockApi(page: Page, opts: MockApiOptions = {}) {
  // region 진입 게이트(신규 슬라이스): 기본은 활성 region을 부팅 전 주입해 지도로 직행한다.
  // addInitScript는 매 네비게이션의 페이지 스크립트보다 먼저 실행되어 loadActiveRegion()이 읽는다.
  if (opts.seedRegion !== false) await seedActiveRegion(page)
  // 인증 게이트(auth-accounts): 기본은 authed 세션을 부팅 전 시드해 LoginView를 건너뛴다.
  // (이 슬라이스 이후 인증 게이트가 최상단 — 시드 없으면 모든 spec이 LoginView에 막힌다.)
  const seedAuth = opts.seedAuth !== false
  if (seedAuth) await seedAuthedSession(page)
  // M-10 계산 레시피 — 서버 단일 소스 상태 모킹 (설정 시트가 열 때마다 GET으로 최신화)
  let calcRecipes: CalcRecipe[] | null = opts.calcRecipes ?? null
  // M-11 팔레트 — 상태 보존 모킹 (calc-recipes 선례): PUT 전체 upsert·DELETE 단건 제거가
  // 이후 GET 응답에 반영되어야 저장 후 재조회 경로(AC-6)가 서버 동형으로 검증된다
  let colors: ColorLabel[] = COLORS_FIXTURE.map((c) => ({ ...c }))
  // M-12 JSON 불러오기 — 상태 보존 모킹: PUT import가 이후 GET state 응답에 반영되어야
  // 적용 후 재조회 경로(importFromFile ③)가 서버 동형으로 검증된다.
  // M-16 탭 격리(AC-1): tabState를 per-tab 맵으로 분기 — TAB_ID(A)는 기본 픽스처,
  // TAB_B_ID(B)는 빈 상태. POST upsert가 URL의 탭 id에 따라 해당 탭에만 반영된다.
  const tabStates = new Map<string, TabStateResponse>()
  tabStates.set(TAB_ID, structuredClone(TAB_STATE_FIXTURE))
  if ((opts.tabs ?? 1) >= 2) {
    tabStates.set(TAB_B_ID, { overrides: {}, groups: {} })
  }
  // M-15 초기화 — opt-in pinned 필지 합류 + 기본 그룹 제거 (파랑 = pinned 단독 출처)
  if (opts.withPinnedParcel === true) {
    const a = tabStates.get(TAB_ID)
    if (a === undefined) throw new Error('unreachable')
    a.overrides[PINNED_PARCEL_ID] = {
      color: 'c-blue',
      style: 'fill',
      name: null,
      memo: null,
      pinned: true,
      icon: null,
    }
    a.groups = {}
  }
  // M-16 활성 탭 목록 — opts.tabs에 따라 1개 또는 2개. POST /api/tabs 생성·PATCH 이름변경·
  // DELETE 소프트클로즈가 이 배열에 반영된다(상태 보존 — calc-recipes 선례)
  const activeTabs: TabFixture[] = [TAB_A_FIXTURE]
  if ((opts.tabs ?? 1) >= 2) activeTabs.push(TAB_B_FIXTURE)
  // M-16 히스토리 — opt-in 닫힌 탭 2개. PATCH 이름변경·DELETE 소프트딜리트·restore가 반영된다
  let historyItems: TabFixture[] = []
  if (opts.history === true) {
    historyItems = [
      { ...makeTab(HISTORY_H2_ID, HISTORY_H2_NAME, 0), closedAt: HISTORY_H2_CLOSED_AT },
      { ...makeTab(HISTORY_H1_ID, HISTORY_H1_NAME, 0), closedAt: HISTORY_H1_CLOSED_AT },
    ]
  }
  let createdTabSeq = 0
  // 슬라이스 3 region — 받은 목록 상태 보존 모킹. acquire/remove가 mine 응답에 반영된다(AC-7·9·11).
  // seedRegion!==false면 SEED를 받은 상태로 시작(지도 직행 + 관리 화면 일관).
  const acquiredRegionIds = new Set<string>()
  if (opts.seedRegion !== false) acquiredRegionIds.add(SEED_REGION_ID)
  // M-13 V-World 토지임야 조회 — 성공 후 PNU_PARCEL_ID의 단건 재조회가 조회 완료 상태를
  // 반영하도록 하는 상태 플래그 (서버 단일 소스 동형). spec 간 격리는 page.route가 per-page라 보장.
  let landFetched = false
  // 슬라이스 5a 영농 ERP — 인력·거래처 상태 보존 모킹 (전역 공유 단일 테이블, 절충 1).
  // 빈 상태로 시작 → 생성·수정·소프트비활성·재활성화가 이 배열에 반영되어 GET 재조회에 보인다.
  interface ErpStaffRow {
    staffId: string
    name: string
    phone: string | null
    role: string | null
    dailyWage: number | null
    memo: string | null
    active: boolean
    createdBy: string | null
    createdAt: string
    updatedAt: string
  }
  interface ErpContactRow {
    contactId: string
    name: string
    manager: string | null
    phone: string | null
    kind: 'buy' | 'sell' | 'both'
    memo: string | null
    active: boolean
    createdBy: string | null
    createdAt: string
    updatedAt: string
  }
  const erpStaff: ErpStaffRow[] = []
  const erpContacts: ErpContactRow[] = []
  let erpStaffSeq = 0
  let erpContactSeq = 0
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const { pathname } = new URL(route.request().url())
      const method = route.request().method()
      // M-16 활성 탭 목록(GET) + 생성(POST). 생성 탭 id는 tab_ 접두로 H-1(genTabId) 형식 동형
      if (pathname === '/api/tabs') {
        if (method === 'GET') return route.fulfill({ json: activeTabs })
        if (method === 'POST') {
          const body = route.request().postDataJSON() as { name?: string }
          const tab = makeTab(
            `tab_e2enew${String(++createdTabSeq)}`,
            body.name ?? '새 작업공간',
            activeTabs.length,
          )
          activeTabs.push(tab)
          tabStates.set(tab.tabId, { overrides: {}, groups: {} }) // 새 탭은 빈 상태 (AC-2)
          return route.fulfill({ json: tab })
        }
      }
      // M-16 탭 이름변경(PATCH)·소프트클로즈(DELETE). DELETE는 활성 탭에서 제거(상태 보존).
      // 마지막 탭 보호(409)는 클라 가드가 사전 차단하므로 여기선 단순 제거만 — 본문 검증은 spec 소관
      const tabItemMatch = /^\/api\/tabs\/([^/]+)$/.exec(pathname)
      if (tabItemMatch !== null) {
        const id = decodeURIComponent(tabItemMatch[1])
        if (method === 'PATCH') {
          const body = route.request().postDataJSON() as { name?: string }
          const t = activeTabs.find((x) => x.tabId === id)
          if (t !== undefined && body.name !== undefined) t.name = body.name
          return route.fulfill({ json: t ?? activeTabs[0] })
        }
        if (method === 'DELETE') {
          const idx = activeTabs.findIndex((x) => x.tabId === id)
          if (idx !== -1) activeTabs.splice(idx, 1)
          return route.fulfill({ json: { ok: true } })
        }
      }
      // M-16 히스토리 목록(GET) — closedAt 내림차순(AC-6). historyItemSchema 동형
      if (pathname === '/api/history' && method === 'GET') {
        const sorted = [...historyItems].sort((a, b) =>
          (b.closedAt ?? '').localeCompare(a.closedAt ?? ''),
        )
        return route.fulfill({ json: sorted })
      }
      // M-16 히스토리 복원(POST restore) — 새 활성 탭으로 부여. 복원 탭 상태는 원본 H의 데이터와
      // 일치(AC-7): 서버가 group_id를 재생성하므로 새 group_id로 그룹을 담는다(C-3 동형)
      const restoreMatch = /^\/api\/history\/([^/]+)\/restore$/.exec(pathname)
      if (restoreMatch !== null && method === 'POST') {
        const id = decodeURIComponent(restoreMatch[1])
        historyItems = historyItems.filter((h) => h.tabId !== id)
        const tab = makeTab(RESTORED_TAB_ID, '닫힌 작업 둘', activeTabs.length)
        activeTabs.push(tab)
        // AC-7 검증용: 복원된 탭은 RED_PARCEL_ID(c-red) override + 재생성 group_id 그룹을 가진다
        tabStates.set(RESTORED_TAB_ID, {
          overrides: {
            [RED_PARCEL_ID]: {
              color: 'c-red',
              style: 'fill',
              name: null,
              memo: null,
              pinned: false,
              icon: null,
            },
          },
          groups: {
            grp_restored_new: {
              name: '복원 그룹',
              memo: null,
              color: 'c-blue',
              style: 'fill',
              parcelIds: GROUP_MEMBER_IDS,
            },
          },
        })
        return route.fulfill({ json: tab })
      }
      // M-16 히스토리 이름변경(PATCH)·소프트딜리트(DELETE)
      const historyItemMatch = /^\/api\/history\/([^/]+)$/.exec(pathname)
      if (historyItemMatch !== null) {
        const id = decodeURIComponent(historyItemMatch[1])
        if (method === 'PATCH') {
          const body = route.request().postDataJSON() as { name?: string }
          const h = historyItems.find((x) => x.tabId === id)
          if (h !== undefined && body.name !== undefined) h.name = body.name
          return route.fulfill({ json: h ?? historyItems[0] })
        }
        if (method === 'DELETE') {
          historyItems = historyItems.filter((x) => x.tabId !== id)
          return route.fulfill({ json: { ok: true } })
        }
      }
      // 슬라이스 3 region 카탈로그(GET, 공개)·받은 목록(GET)·받기(POST)·제거(DELETE)
      if (pathname === '/api/regions' && method === 'GET')
        return route.fulfill({ json: REGIONS_CATALOG_FIXTURE })
      if (pathname === '/api/regions/mine' && method === 'GET') {
        if (!seedAuth) return route.fulfill({ status: 401, json: { error: '인증 필요 (e2e)' } })
        return route.fulfill({
          json: [...acquiredRegionIds].map((id) => ({ regionId: id, acquiredAt: NOW })),
        })
      }
      const acquireMatch = /^\/api\/regions\/([^/]+)\/acquire$/.exec(pathname)
      if (acquireMatch !== null && method === 'POST') {
        if (!seedAuth) return route.fulfill({ status: 401, json: { error: '인증 필요 (e2e)' } })
        const id = decodeURIComponent(acquireMatch[1])
        const region = REGIONS_CATALOG_FIXTURE.find((r) => r.id === id)
        if (region === undefined || !region.loaded)
          return route.fulfill({ status: 409, json: { error: '준비 중 region (e2e)' } })
        acquiredRegionIds.add(id)
        return route.fulfill({ json: { regionId: id, acquiredAt: NOW } })
      }
      const regionItemMatch = /^\/api\/regions\/([^/]+)$/.exec(pathname)
      if (regionItemMatch !== null && method === 'DELETE') {
        if (!seedAuth) return route.fulfill({ status: 401, json: { error: '인증 필요 (e2e)' } })
        acquiredRegionIds.delete(decodeURIComponent(regionItemMatch[1]))
        return route.fulfill({ json: { ok: true } })
      }
      // 인증 게이트 — seedAuth면 가짜 supabase 구성을 내려 실 클라이언트를 만들고 시드 세션을 복원한다.
      // seedAuth=false면 키 없는 {} → getSupabaseClient()=null → authStatus='anon' → LoginView.
      if (pathname === '/api/config')
        return route.fulfill({
          json: seedAuth
            ? { supabaseUrl: FAKE_SUPABASE_URL, supabaseAnonKey: FAKE_SUPABASE_ANON_KEY }
            : {},
        })
      // GET /api/me — 세션 신원 (meResponseSchema 동형). seedAuth면 시드 사용자, 아니면 401
      if (pathname === '/api/me' && method === 'GET') {
        if (!seedAuth) return route.fulfill({ status: 401, json: { error: '인증 필요 (e2e)' } })
        return route.fulfill({ json: ME_FIXTURE })
      }
      // M-11 색상 팔레트: GET 목록·PUT 전체 upsert(okResponseSchema 동형)·DELETE 단건 제거
      if (pathname === '/api/colors') {
        if (route.request().method() === 'GET') return route.fulfill({ json: colors })
        if (route.request().method() === 'PUT') {
          colors = (route.request().postDataJSON() as { colors: ColorLabel[] }).colors
          return route.fulfill({ json: { ok: true } })
        }
      }
      const colorDeleteMatch = /^\/api\/colors\/([^/]+)$/.exec(pathname)
      if (colorDeleteMatch !== null && route.request().method() === 'DELETE') {
        const colorId = decodeURIComponent(colorDeleteMatch[1])
        colors = colors.filter((c) => c.colorId !== colorId)
        return route.fulfill({ json: { ok: true } })
      }
      // M-16 탭 스코프 state — 탭 id별 분기(AC-1 격리의 핵심). 미지정 탭은 빈 상태로 생성.
      const stateMatch = /^\/api\/tabs\/([^/]+)\/state$/.exec(pathname)
      if (stateMatch !== null && method === 'GET') {
        const id = decodeURIComponent(stateMatch[1])
        let st = tabStates.get(id)
        if (st === undefined) {
          st = { overrides: {}, groups: {} }
          tabStates.set(id, st)
        }
        return route.fulfill({ json: st })
      }
      // M-12 JSON 불러오기 — 전체 교체. 서버 tabImportHandler의 group_id 전부 재생성(PK 충돌
      // 방지)을 모사한다: 파일의 groupId로 로컬을 채우면 키가 어긋남을 재조회 경로로 검증 가능
      const importMatch = /^\/api\/tabs\/([^/]+)\/import$/.exec(pathname)
      if (importMatch !== null && method === 'PUT') {
        const id = decodeURIComponent(importMatch[1])
        const body = route.request().postDataJSON() as {
          overrides: TabStateResponse['overrides']
          groups: TabStateResponse['groups']
        }
        let seq = 0
        tabStates.set(id, {
          overrides: body.overrides,
          groups: Object.fromEntries(
            Object.values(body.groups).map((g) => [`g-imported-${String(++seq)}`, g]),
          ),
        })
        return route.fulfill({ json: { ok: true } })
      }
      // M-10 자동 계산기: 레시피 GET(calcRecipesResponseSchema 동형)·PUT(저장 → 이후 GET 반영)
      if (pathname === '/api/calc-recipes') {
        if (route.request().method() === 'GET')
          return route.fulfill({ json: { recipes: calcRecipes } })
        if (route.request().method() === 'PUT') {
          calcRecipes = (route.request().postDataJSON() as { recipes: CalcRecipe[] }).recipes
          return route.fulfill({ json: { ok: true } })
        }
      }
      // M-9 목록 뷰: 전 필지 면적 일괄 조회 (페이징은 핸들러 소관 — 응답은 단일 레코드)
      if (pathname === '/api/parcel-areas' && route.request().method() === 'GET')
        return route.fulfill({ json: PARCEL_AREAS_FIXTURE })
      // M-7 필지 시트: 단건 조회(지번·면적) — parcelResponseSchema(src/types/api/parcels.ts) 동형
      const parcelMatch = /^\/api\/parcels\/([^/]+)$/.exec(pathname)
      if (parcelMatch !== null && route.request().method() === 'GET') {
        const id = decodeURIComponent(parcelMatch[1])
        const raw = RAW_BY_ID.get(id)
        if (raw === undefined)
          return route.fulfill({ status: 404, json: { error: '필지 없음 (e2e 픽스처)' } })
        // M-13: PNU_PARCEL_ID만 pnu가 채워진 미조회 필지 — "토지임야 조회" 버튼 노출 조건.
        // landFetched면 fetch-land-info 성공 후 재조회 동형으로 갱신 행을 반환한다.
        const isPnuParcel = id === PNU_PARCEL_ID
        return route.fulfill({
          json: {
            localId: raw.id,
            pnu: isPnuParcel ? '1111111111111111111' : null,
            jibun: raw.jibun,
            jibunFull: null,
            ldCode: null,
            ldCodeNm: null,
            lndcgrCode: null,
            lndcgrCodeNm: isPnuParcel && landFetched ? LAND_INFO_LNDCGR_NM : null,
            lndpclAr: PARCEL_FIXTURE_AREA_M2,
            posesnSeCode: null,
            posesnSeCodeNm: null,
            cnrsPsnCo: null,
            regstrSeCode: null,
            regstrSeCodeNm: null,
            coordinates: raw.c,
            vworldFetchedAt: isPnuParcel && landFetched ? NOW : null,
          },
        })
      }
      // M-13 V-World 토지임야 조회: 성공 시 갱신된 parcels 행 전체(parcelSchema, camelCase).
      // 이후 landFetched 플래그로 같은 필지의 단건 재조회도 조회 완료 상태를 반영한다.
      const landInfoMatch = /^\/api\/parcels\/([^/]+)\/fetch-land-info$/.exec(pathname)
      if (landInfoMatch !== null && route.request().method() === 'POST') {
        const id = decodeURIComponent(landInfoMatch[1])
        const raw = RAW_BY_ID.get(id)
        if (raw === undefined || id !== PNU_PARCEL_ID)
          return route.fulfill({ status: 409, json: { error: 'pnu 없음 (e2e 픽스처)' } })
        landFetched = true
        return route.fulfill({
          json: {
            localId: raw.id,
            pnu: '1111111111111111111',
            jibun: raw.jibun,
            jibunFull: null,
            ldCode: null,
            ldCodeNm: null,
            lndcgrCode: '01',
            lndcgrCodeNm: LAND_INFO_LNDCGR_NM,
            lndpclAr: PARCEL_FIXTURE_AREA_M2,
            posesnSeCode: null,
            posesnSeCodeNm: null,
            cnrsPsnCo: null,
            regstrSeCode: null,
            regstrSeCodeNm: null,
            coordinates: raw.c,
            vworldFetchedAt: NOW,
          },
        })
      }
      // M-7 필지 저장(upsert) — okResponseSchema 동형. 본문 검증은 spec이 waitForRequest로 수행.
      // M-16: 탭 스코프로 persist — URL의 탭 id에 따라 해당 탭 state에만 반영(AC-1 전환 후 복원).
      // 서버 전체 행 치환 동형: 받은 전체 의미 필드로 override를 덮는다(부분 patch 금지).
      const parcelUpsertMatch = /^\/api\/tabs\/([^/]+)\/parcels\/([^/]+)$/.exec(pathname)
      if (parcelUpsertMatch !== null && method === 'POST') {
        const tabId = decodeURIComponent(parcelUpsertMatch[1])
        const parcelId = decodeURIComponent(parcelUpsertMatch[2])
        const body = route.request().postDataJSON() as Record<string, unknown>
        const st = tabStates.get(tabId)
        if (st !== undefined) {
          const override = {
            color: (body.color as string | null) ?? null,
            style: (body.style as 'fill' | 'border' | null) ?? null,
            name: (body.name as string | null) ?? null,
            memo: (body.memo as string | null) ?? null,
            pinned: (body.pinned as boolean | undefined) ?? false,
            icon: (body.icon as string | null) ?? null,
          }
          const cleared =
            override.color === null &&
            override.style === null &&
            override.name === null &&
            override.memo === null &&
            !override.pinned &&
            override.icon === null
          if (cleared) delete st.overrides[parcelId]
          else st.overrides[parcelId] = override
        }
        return route.fulfill({ json: { ok: true } })
      }
      // M-8 그룹 저장(upsert / group: null = 삭제) — okResponseSchema 동형.
      // 본문 검증은 spec이 waitForRequest·요청 리코더로 수행
      const groupUpsertMatch = /^\/api\/tabs\/([^/]+)\/groups$/.exec(pathname)
      if (groupUpsertMatch !== null && method === 'POST')
        return route.fulfill({ json: { ok: true } })
      // M-15 초기화 — okResponseSchema 동형. pinned 보호·비고정 비움은 스토어 낙관적 정리 소관이라
      // 모킹은 ok만 반환한다. 본문(items·clientId) 검증은 spec이 waitForRequest로 수행
      const resetMatch = /^\/api\/tabs\/([^/]+)\/reset$/.exec(pathname)
      if (resetMatch !== null && method === 'POST') return route.fulfill({ json: { ok: true } })
      // 슬라이스 4 GPS 역지오코딩 — opts.geocode 지정 시에만 등록(미지정이면 404로 누락 노출).
      // 좌표 본문은 받되 응답에 에코하지 않는다(절충 3): area만 반환하거나 에러 status.
      if (pathname === '/api/geocode/reverse' && method === 'POST') {
        if (opts.geocode === undefined)
          return route.fulfill({ status: 404, json: { error: 'geocode 모킹 미설정 (e2e)' } })
        if ('status' in opts.geocode)
          return route.fulfill({
            status: opts.geocode.status,
            json: { error: `geocode ${String(opts.geocode.status)} (e2e)` },
          })
        return route.fulfill({ json: { area: opts.geocode.area } })
      }
      // 슬라이스 5a 영농 ERP 인력 — 상태 보존 모킹(생성·수정·소프트비활성·재활성화가 GET에 반영).
      // GET ?includeInactive=true면 전량, 아니면 active만 (AC-2 동형). created_by 신원·전역 공유.
      if (pathname === '/api/staff') {
        const includeInactive = new URL(route.request().url()).searchParams.get('includeInactive')
        if (method === 'GET') {
          const rows =
            includeInactive === 'true' ? erpStaff : erpStaff.filter((s) => s.active)
          return route.fulfill({ json: rows })
        }
        if (method === 'POST') {
          const body = route.request().postDataJSON() as Record<string, unknown>
          const row = {
            staffId: `staff-e2e-${String(++erpStaffSeq)}`,
            name: String(body.name ?? ''),
            phone: (body.phone as string | undefined) ?? null,
            role: (body.role as string | undefined) ?? null,
            dailyWage: (body.dailyWage as number | undefined) ?? null,
            memo: (body.memo as string | undefined) ?? null,
            active: true,
            createdBy: SEED_USER_ID,
            createdAt: NOW,
            updatedAt: NOW,
          }
          erpStaff.push(row)
          return route.fulfill({ json: row })
        }
      }
      const staffItemMatch = /^\/api\/staff\/([^/]+)$/.exec(pathname)
      if (staffItemMatch !== null) {
        const id = decodeURIComponent(staffItemMatch[1])
        const row = erpStaff.find((s) => s.staffId === id)
        if (method === 'PATCH') {
          const body = route.request().postDataJSON() as Record<string, unknown>
          if (row !== undefined) {
            if (body.name !== undefined) row.name = String(body.name)
            if (body.phone !== undefined) row.phone = body.phone as string | null
            if (body.role !== undefined) row.role = body.role as string | null
            if (body.dailyWage !== undefined) row.dailyWage = body.dailyWage as number | null
            if (body.memo !== undefined) row.memo = body.memo as string | null
            if (body.active !== undefined) row.active = Boolean(body.active)
            row.updatedAt = NOW
          }
          return route.fulfill({ json: row ?? erpStaff[0] })
        }
        if (method === 'DELETE') {
          if (row !== undefined) row.active = false // 소프트 비활성 (AC-4)
          return route.fulfill({ json: { ok: true } })
        }
      }
      // 슬라이스 5a 영농 ERP 거래처 — 인력 동형(kind 보존)
      if (pathname === '/api/contacts') {
        const includeInactive = new URL(route.request().url()).searchParams.get('includeInactive')
        if (method === 'GET') {
          const rows =
            includeInactive === 'true' ? erpContacts : erpContacts.filter((c) => c.active)
          return route.fulfill({ json: rows })
        }
        if (method === 'POST') {
          const body = route.request().postDataJSON() as Record<string, unknown>
          const row = {
            contactId: `contact-e2e-${String(++erpContactSeq)}`,
            name: String(body.name ?? ''),
            manager: (body.manager as string | undefined) ?? null,
            phone: (body.phone as string | undefined) ?? null,
            kind: (body.kind as 'buy' | 'sell' | 'both' | undefined) ?? 'buy',
            memo: (body.memo as string | undefined) ?? null,
            active: true,
            createdBy: SEED_USER_ID,
            createdAt: NOW,
            updatedAt: NOW,
          }
          erpContacts.push(row)
          return route.fulfill({ json: row })
        }
      }
      const contactItemMatch = /^\/api\/contacts\/([^/]+)$/.exec(pathname)
      if (contactItemMatch !== null) {
        const id = decodeURIComponent(contactItemMatch[1])
        const row = erpContacts.find((c) => c.contactId === id)
        if (method === 'PATCH') {
          const body = route.request().postDataJSON() as Record<string, unknown>
          if (row !== undefined) {
            if (body.name !== undefined) row.name = String(body.name)
            if (body.manager !== undefined) row.manager = body.manager as string | null
            if (body.phone !== undefined) row.phone = body.phone as string | null
            if (body.kind !== undefined) row.kind = body.kind as 'buy' | 'sell' | 'both'
            if (body.memo !== undefined) row.memo = body.memo as string | null
            if (body.active !== undefined) row.active = Boolean(body.active)
            row.updatedAt = NOW
          }
          return route.fulfill({ json: row ?? erpContacts[0] })
        }
        if (method === 'DELETE') {
          if (row !== undefined) row.active = false
          return route.fulfill({ json: { ok: true } })
        }
      }
      // 부팅 시퀀스 밖의 호출은 명시 실패 — 모킹 누락을 침묵시키지 않는다
      return route.fulfill({ status: 404, json: { error: `e2e 모킹 누락: ${pathname}` } })
    },
  )
  // 가짜 supabase 도메인 — 시드 세션은 오프라인 복원이라 정상 부팅엔 안 불리지만,
  // 로그아웃(POST /auth/v1/logout)·사용자 조회·토큰 갱신이 발생하면 무해 처리한다(웹소켓은 자연 실패).
  if (seedAuth) {
    await page.route(
      (url) => url.hostname === 'e2e-test.supabase.co',
      (route) => {
        const { pathname } = new URL(route.request().url())
        // 로그아웃 — supabase-js가 200/204면 로컬 세션을 비우고 SIGNED_OUT을 발화한다(AC-6)
        if (pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' })
        if (pathname.endsWith('/user')) return route.fulfill({ json: { id: SEED_USER_ID } })
        // 그 외(token refresh 등) — 빈 200. 시드 세션 미만료라 실제로는 거의 안 불린다
        return route.fulfill({ json: {} })
      },
    )
  }
}

/**
 * M-16 — 햄버거(aria-label "메뉴")로 NavDrawer를 열고 진입 항목을 탭한다.
 * 임시 IconButton 진입점들이 NavDrawer 안으로 이관되어, 항목 클릭 앞에 드로어 열기가 선행되어야 한다.
 * NavDrawer는 항목 탭 시 자동으로 닫히므로(run→close), 같은 항목을 다시 열려면 매번 이 헬퍼를 호출한다.
 */
export async function openMenuItem(page: Page, name: string) {
  await page.getByRole('button', { name: '메뉴' }).click()
  await page.getByRole('button', { name, exact: true }).click()
}

// ── 부팅 완료 판정 (픽셀 신호) ───────────────────────────────────────────────
// 엔진 보존 색상 (src/features/map/engine/colors.ts)
const BACKGROUND = { r: 251, g: 250, b: 246 } // 배경 #FBFAF6
const FILL_OPACITY = 0.55 // 2·3차 색 채움 hexA(hex, 0.55)

export type Rgb = { r: number; g: number; b: number }

/**
 * 색 채움(hexA(hex, 0.55))이 배경 위에 합성된 기대 픽셀색.
 * 아래가 흰 필지 채움인 지점은 채널당 최대 +4.05 차이 — 허용오차로 흡수한다.
 */
export function compositedFill(hex: string): Rgb {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return {
    r: r * FILL_OPACITY + BACKGROUND.r * (1 - FILL_OPACITY),
    g: g * FILL_OPACITY + BACKGROUND.g * (1 - FILL_OPACITY),
    b: b * FILL_OPACITY + BACKGROUND.b * (1 - FILL_OPACITY),
  }
}

export const COMPOSITE_TOLERANCE = 6

/** 메인 캔버스(첫 canvas) 백버퍼에서 지정 색 ±tol 이내 픽셀 수 */
export function countNearPixels(page: Page, color: Rgb, tol: number) {
  return page.evaluate(
    ({ r, g, b, tol }) => {
      const cv = document.querySelector('canvas')
      const ctx = cv?.getContext('2d')
      if (!cv || !ctx) return 0
      const { data } = ctx.getImageData(0, 0, cv.width, cv.height)
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        if (
          Math.abs(data[i] - r) <= tol &&
          Math.abs(data[i + 1] - g) <= tol &&
          Math.abs(data[i + 2] - b) <= tol
        )
          count++
      }
      return count
    },
    { ...color, tol },
  )
}

/**
 * 모킹 부팅 완료까지 poll 대기 — override 필지(RED_PARCEL_ID)의 빨강 합성 픽셀 출현이
 * "boot() 완료 + 서버 상태 렌더 반영"의 사용자 가시 신호다 (C-4 isInitializing 해제 보장 포함).
 * goto('/') + 첫 draw(style.width 설정) 대기를 포함하므로 spec은 이 호출 하나로 부팅을 끝낸다.
 */
export async function bootWithMockedApi(page: Page, opts: MockApiOptions = {}) {
  await mockApi(page, opts)
  await page.goto('/')
  await page.waitForFunction(() => {
    const cv = document.querySelector('canvas')
    return cv !== null && cv.style.width !== ''
  })
  await expect
    .poll(() => countNearPixels(page, compositedFill(PARCEL_HEX), COMPOSITE_TOLERANCE), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0)
}
