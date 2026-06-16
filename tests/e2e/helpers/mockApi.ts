import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
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
const NOW = '2026-06-11T00:00:00.000Z'

const TABS_FIXTURE = [
  {
    tabId: TAB_ID,
    name: '기본',
    sortOrder: 0,
    closedAt: null,
    createdAt: NOW,
    updatedBy: null,
    updatedAt: NOW,
  },
]

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
  // M-10 계산 레시피 — 서버 단일 소스 상태 모킹 (설정 시트가 열 때마다 GET으로 최신화)
  let calcRecipes: CalcRecipe[] | null = opts.calcRecipes ?? null
  // M-11 팔레트 — 상태 보존 모킹 (calc-recipes 선례): PUT 전체 upsert·DELETE 단건 제거가
  // 이후 GET 응답에 반영되어야 저장 후 재조회 경로(AC-6)가 서버 동형으로 검증된다
  let colors: ColorLabel[] = COLORS_FIXTURE.map((c) => ({ ...c }))
  // M-12 JSON 불러오기 — 상태 보존 모킹: PUT import가 이후 GET state 응답에 반영되어야
  // 적용 후 재조회 경로(importFromFile ③)가 서버 동형으로 검증된다
  let tabState: TabStateResponse = structuredClone(TAB_STATE_FIXTURE)
  // M-13 V-World 토지임야 조회 — 성공 후 PNU_PARCEL_ID의 단건 재조회가 조회 완료 상태를
  // 반영하도록 하는 상태 플래그 (서버 단일 소스 동형). spec 간 격리는 page.route가 per-page라 보장.
  let landFetched = false
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const { pathname } = new URL(route.request().url())
      if (pathname === '/api/tabs') return route.fulfill({ json: TABS_FIXTURE })
      // supabase 키 없는 config — realtime(M-6)이 disabled로 무해 종료한다 (AC-11 사전 조건)
      if (pathname === '/api/config') return route.fulfill({ json: {} })
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
      if (pathname === `/api/tabs/${TAB_ID}/state`) return route.fulfill({ json: tabState })
      // M-12 JSON 불러오기 — 전체 교체. 서버 tabImportHandler의 group_id 전부 재생성(PK 충돌
      // 방지)을 모사한다: 파일의 groupId로 로컬을 채우면 키가 어긋남을 재조회 경로로 검증 가능
      if (pathname === `/api/tabs/${TAB_ID}/import` && route.request().method() === 'PUT') {
        const body = route.request().postDataJSON() as {
          overrides: TabStateResponse['overrides']
          groups: TabStateResponse['groups']
        }
        let seq = 0
        tabState = {
          overrides: body.overrides,
          groups: Object.fromEntries(
            Object.values(body.groups).map((g) => [`g-imported-${String(++seq)}`, g]),
          ),
        }
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
      // M-7 필지 저장(upsert) — okResponseSchema 동형. 본문 검증은 spec이 waitForRequest로 수행
      if (
        route.request().method() === 'POST' &&
        pathname.startsWith(`/api/tabs/${TAB_ID}/parcels/`)
      )
        return route.fulfill({ json: { ok: true } })
      // M-8 그룹 저장(upsert / group: null = 삭제) — okResponseSchema 동형.
      // 본문 검증은 spec이 waitForRequest·요청 리코더로 수행
      if (route.request().method() === 'POST' && pathname === `/api/tabs/${TAB_ID}/groups`)
        return route.fulfill({ json: { ok: true } })
      // 부팅 시퀀스 밖의 호출은 명시 실패 — 모킹 누락을 침묵시키지 않는다
      return route.fulfill({ status: 404, json: { error: `e2e 모킹 누락: ${pathname}` } })
    },
  )
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
