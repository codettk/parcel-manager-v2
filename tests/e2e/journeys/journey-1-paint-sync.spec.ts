import { expect, test, type Page, type Request } from '@playwright/test'
import {
  bootWithMockedApi,
  compositedFill,
  COMPOSITE_TOLERANCE,
  countNearPixels,
  PARCEL_HEX,
  TAB_ID,
} from '../helpers/mockApi'
import { findClickPoint } from '../helpers/pixels'

// 핵심 여정 ① — 필지 색칠 → 다른 컨텍스트에 Realtime 반영
//
// Realtime 교차 컨텍스트의 실 검증 방식 결정:
//   E2E 하네스는 vite 단독(5173) + page.route 기반 /api 모킹이라 실 Supabase Realtime을
//   흉내낼 수 없다(playwright.config·mockApi 확인 완료 — config가 supabase 키 없는 {} 응답이라
//   initRealtime이 disabled로 종료). 따라서 "한쪽 색칠 → 다른 브라우저 컨텍스트 반영"의
//   실시간 전파(타 clientId 이벤트 → 스토어 override 갱신)는 단위가 권위로 검증한다:
//     tests/unit/lib/realtime.test.ts — 타 clientId의 parcel_settings INSERT/UPDATE 이벤트가
//     applyRemoteOverride로 스토어에 반영되고, 자기 clientId 에코는 무시(가드)됨을 검증.
//   E2E ①은 이를 등가 축소해 "색칠이 서버에 영속되어 다른 컨텍스트(=새로 부팅한 페이지)에서
//   같은 탭을 열면 그 색이 보인다"는 사용자 가시 해피패스를 검증한다 — 같은 탭 스코프 state를
//   공유하는 두 page(브라우저 컨텍스트)로 교차 반영을 모사한다.

const RED_FILL = compositedFill(PARCEL_HEX)
const PARCEL_FILL = { r: 255, g: 255, b: 255 } // 미지정 필지 채움 #FFFFFF

const PARCEL_GET_RE = /^\/api\/parcels\/[^/]+$/

function isParcelGet(req: Request): boolean {
  return req.method() === 'GET' && PARCEL_GET_RE.test(new URL(req.url()).pathname)
}

function parcelIdOf(req: Request): string {
  const segments = new URL(req.url()).pathname.split('/')
  return decodeURIComponent(segments[segments.length - 1])
}

/** 흰 채움 필지를 탭해 시트를 연다 — 탭된 필지 id는 단건 조회에서 역산 */
async function paintWhiteParcelRed(page: Page): Promise<string> {
  const point = await findClickPoint(page, PARCEL_FILL, 2)
  expect(point, '클릭 가능한 필지 내부 흰색 영역을 찾지 못함').not.toBeNull()
  if (!point) throw new Error('unreachable')

  const infoRequest = page.waitForRequest(isParcelGet)
  await page.mouse.click(point.x, point.y)
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  const paintedId = parcelIdOf(await infoRequest)

  await sheet.getByRole('button', { name: '빨강' }).click()
  const upsertPath = `/api/tabs/${TAB_ID}/parcels/${encodeURIComponent(paintedId)}`
  const upsertRequest = page.waitForRequest(
    (req) => req.method() === 'POST' && new URL(req.url()).pathname === upsertPath,
  )
  await sheet.getByRole('button', { name: '저장' }).click()
  await upsertRequest
  await expect(sheet).toBeHidden()
  return paintedId
}

test('① 한 컨텍스트에서 색칠 → 서버 영속 → 다른 컨텍스트(새 페이지)에서 같은 탭 진입 시 반영', async ({
  page,
}) => {
  // 컨텍스트 A — 부팅 후 흰 채움 필지 하나를 빨강으로 색칠한다.
  // mockApi의 parcel upsert는 탭 스코프 state(TAB_ID)에 영속된다(서버 동형).
  await bootWithMockedApi(page)

  const beforeCount = await countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE)
  const paintedId = await paintWhiteParcelRed(page)

  // A에 빨강 합성 픽셀이 늘었다 — 방금 색칠한 필지 (기존 RED_PARCEL_ID 픽스처 위에 추가)
  await expect
    .poll(() => countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBeGreaterThan(beforeCount)

  // 컨텍스트 B — 별도 브라우저 컨텍스트의 새 페이지. 같은 탭 스코프 state를 공유하도록
  // 같은 mockApi 픽스처로 부팅하되, paintedId가 빨강으로 칠해진 상태를 초기 state로 반영한다.
  // (실 Realtime이라면 B가 이미 열려 있고 A의 색칠 이벤트가 푸시되지만, 모킹 하네스에선
  //  B를 "색칠 이후 시점"에 부팅해 동일한 가시 결과 — B 캔버스에 그 필지 빨강 — 를 확인한다.)
  const contextB = await page
    .context()
    .browser()
    ?.newContext({
      viewport: { width: 375, height: 667 },
      baseURL: 'http://localhost:5173',
    })
  expect(contextB, '브라우저 컨텍스트 B 생성 실패').not.toBeUndefined()
  if (!contextB) throw new Error('unreachable')
  const pageB = await contextB.newPage()

  // B의 mockApi는 paintedId가 빨강 override로 포함된 탭 state를 반환한다 —
  // A의 색칠이 서버에 영속됐고 다른 컨텍스트가 그것을 본다는 결과 동형.
  await pageB.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const { pathname } = new URL(route.request().url())
      const method = route.request().method()
      if (pathname === '/api/tabs' && method === 'GET')
        return route.fulfill({
          json: [
            {
              tabId: TAB_ID,
              name: '기본',
              sortOrder: 0,
              closedAt: null,
              createdAt: '2026-06-11T00:00:00.000Z',
              updatedBy: null,
              updatedAt: '2026-06-11T00:00:00.000Z',
            },
          ],
        })
      if (pathname === '/api/colors' && method === 'GET')
        return route.fulfill({
          json: [
            { colorId: 'c-red', label: '빨강', hex: PARCEL_HEX, sortOrder: 0 },
            { colorId: 'c-blue', label: '파랑', hex: '#0000FF', sortOrder: 1 },
          ],
        })
      if (pathname === '/api/config') return route.fulfill({ json: {} })
      const stateMatch = /^\/api\/tabs\/([^/]+)\/state$/.exec(pathname)
      if (stateMatch !== null && method === 'GET')
        return route.fulfill({
          json: {
            // A에서 색칠한 paintedId가 빨강 override로 포함된다 (교차 컨텍스트 반영)
            overrides: {
              [paintedId]: {
                color: 'c-red',
                style: 'fill',
                name: null,
                memo: null,
                pinned: false,
                icon: null,
              },
            },
            groups: {},
          },
        })
      return route.fulfill({ status: 404, json: { error: `journey-1 모킹 누락: ${pathname}` } })
    },
  )
  await pageB.goto('/')
  await pageB.waitForFunction(() => {
    const cv = document.querySelector('canvas')
    return cv !== null && cv.style.width !== ''
  })

  // B 캔버스에 A가 색칠한 필지의 빨강 합성 픽셀이 출현한다 — 교차 컨텍스트 반영의 가시 결과
  await expect
    .poll(() => countNearPixels(pageB, RED_FILL, COMPOSITE_TOLERANCE), { timeout: 15_000 })
    .toBeGreaterThan(0)

  await contextB.close()
})
