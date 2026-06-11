import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'

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

const COLORS_FIXTURE = [
  { colorId: 'c-red', label: '빨강', hex: PARCEL_HEX, sortOrder: 0 },
  { colorId: 'c-blue', label: '파랑', hex: GROUP_HEX, sortOrder: 1 },
]

// 필지 id는 public/data/parcels.json의 실제 id여야 렌더된다 — 면적 상위 필지를 골라
// 초기 fit(전체 보기)에서도 합성 픽셀이 확실히 출현하게 한다
interface RawParcel {
  id: string
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

const TAB_STATE_FIXTURE = {
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
export async function mockApi(page: Page) {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const { pathname } = new URL(route.request().url())
      if (pathname === '/api/tabs') return route.fulfill({ json: TABS_FIXTURE })
      if (pathname === '/api/colors') return route.fulfill({ json: COLORS_FIXTURE })
      if (pathname === `/api/tabs/${TAB_ID}/state`)
        return route.fulfill({ json: TAB_STATE_FIXTURE })
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
export async function bootWithMockedApi(page: Page) {
  await mockApi(page)
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
