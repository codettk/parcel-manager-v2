import { expect, test, type Page } from '@playwright/test'
import {
  bootWithMockedApi,
  FAKE_SUPABASE_URL,
  ME_FIXTURE,
  mockApi,
  openMenuItem,
  SEED_USER_ID,
  SUPABASE_SESSION_STORAGE_KEY,
} from './helpers/mockApi'
import { HANDOFF_GLOBAL_KEY } from '../../src/features/auth/authBridge'

// 계정·인증 기반 (docs/specs/auth-accounts.md). AC ↔ test 1:1.
// 부팅 순서: 로그인(인증 게이트) → region 게이트 → 지도.
//
// 세션 주입 seam(코드 변경 없음): /api/config가 가짜 supabase url/anonKey를 내리면
// getSupabaseClient()가 실 supabase-js 클라이언트를 만들고, supabase-js가 읽는 localStorage
// 세션 키에 만료 안 된 세션을 심으면 getSession()이 네트워크 없이 복원한다(mockApi 헬퍼).
//
// 서버 강제 AC는 e2e 비중복(보고에 기록):
//   - AC-9 (created_by=user_id) · AC-12 (무토큰 mutate 401) → tests/integration/auth.test.ts 권위.
//   - AC-10 / AC-11 (멀티 디바이스 Realtime 전파·디바이스 단위 에코 가드) → mockApi 하네스가
//     실 Supabase Realtime을 흉내낼 수 없어(journey-1 선례) tests/unit/lib/realtime.test.ts·
//     통합 위임. 본 파일은 e2e 가능 범위(게이트·세션·핸드오프)만 검증한다.

const LOGIN_CTA = '카카오로 시작하기'
const REGION_HEADING = '지역 선택'

/** 가짜 supabase 도메인의 GoTrue 엔드포인트를 라우팅한다 (setSession `/user`·토큰 갱신 등) */
async function routeSupabaseAuth(page: Page) {
  await page.route(
    (url) => url.hostname === new URL(FAKE_SUPABASE_URL).hostname,
    (route) => {
      const { pathname } = new URL(route.request().url())
      // GoTrue 사용자 조회 — setSession이 토큰의 사용자를 확정할 때 호출
      if (pathname.endsWith('/user'))
        return route.fulfill({
          json: {
            id: SEED_USER_ID,
            aud: 'authenticated',
            role: 'authenticated',
            email: ME_FIXTURE.email,
            app_metadata: { provider: 'kakao' },
            user_metadata: {},
            created_at: '2026-01-01T00:00:00.000Z',
          },
        })
      if (pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' })
      return route.fulfill({ json: {} })
    },
  )
}

/** base64url(JSON) — supabase-js decodeJWT(dr)가 페이로드를 파싱한다(서명 미검증) */
function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** 미만료 exp를 가진 비서명 JWT — setSession이 exp를 읽어 만료 아님으로 판정(네트워크 갱신 회피) */
function fakeJwt(): string {
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: SEED_USER_ID, exp })}.${b64url('sig')}`
}

// ── 로그인 게이트 — 진입 강제 (AC-1~4) ──────────────────────────────────────

test.describe('로그인 게이트', () => {
  test('AC-1: 비로그인이면 LoginView만 — 지도·탭바·지역 선택 화면이 일체 미노출', async ({
    page,
  }) => {
    await mockApi(page, { seedAuth: false, seedRegion: false })
    await page.goto('/')

    // 로그인 화면(카카오 CTA)만 보인다
    await expect(page.getByRole('button', { name: LOGIN_CTA })).toBeVisible()
    // 앱 본문 일체 미노출 — 지도 캔버스·탭바(메뉴)·지역 선택 화면·지역칩
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '메뉴' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: REGION_HEADING })).toHaveCount(0)
  })

  test('AC-2: 카카오 OAuth 콜백 성공 → 세션 수립·로그인 화면 닫힘 → region 게이트 진입', async ({
    page,
  }) => {
    // OAuth 성공을 콜백+세션 주입으로 시뮬레이션(실제 카카오 비범위): 세션을 미리 심고
    // /auth/callback로 진입하면 completeOAuthFromUrl이 getSession으로 세션을 확정해 authed 전이.
    await mockApi(page, { seedAuth: true, seedRegion: false })
    await routeSupabaseAuth(page)
    await page.goto('/auth/callback')

    // 세션 수립 → 로그인 화면이 닫히고(카카오 CTA 사라짐) region 게이트(지역 선택)로 진입
    await expect(page.getByRole('heading', { name: REGION_HEADING })).toBeVisible()
    await expect(page.getByRole('button', { name: LOGIN_CTA })).toHaveCount(0)
  })

  test('AC-3: 로그인 + region 기록 없음 → 지역 선택 화면(지도 직행 아님)', async ({ page }) => {
    await mockApi(page, { seedAuth: true, seedRegion: false })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: REGION_HEADING })).toBeVisible()
    // region 게이트가 로그인 다음 관문 — 지도 캔버스는 아직 없다
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('AC-4: 로그인 + region 기록 있음 → 지역 선택을 건너뛰고 지도로 직행', async ({ page }) => {
    // bootWithMockedApi: seedAuth·seedRegion 모두 기본 주입 → 로그인·region 게이트를 건너뛰고 지도까지
    await bootWithMockedApi(page)

    await expect(page.getByRole('button', { name: '메뉴' })).toBeVisible()
    await expect(page.locator('canvas').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: REGION_HEADING })).toHaveCount(0)
    await expect(page.getByRole('button', { name: LOGIN_CTA })).toHaveCount(0)
  })
})

// ── 세션 영속 / 로그아웃 (AC-5·6) ────────────────────────────────────────────

test.describe('세션 영속 / 로그아웃', () => {
  test('AC-5: 새로고침해도 세션 복원 → 로그인 없이 지도로 복귀', async ({ page }) => {
    await bootWithMockedApi(page)
    await expect(page.getByRole('button', { name: '메뉴' })).toBeVisible()

    // 실제 새로고침 — 시드 세션은 localStorage에 영속되어 supabase-js가 복원한다
    await page.reload()
    await page.waitForFunction(() => {
      const cv = document.querySelector('canvas')
      return cv !== null && cv.style.width !== ''
    })
    // 로그인 화면을 다시 거치지 않고 곧바로 지도
    await expect(page.getByRole('button', { name: LOGIN_CTA })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '메뉴' })).toBeVisible()
  })

  test('AC-6: 내 정보에서 로그아웃 → 세션 파기 → LoginView 복귀(본문 미노출)', async ({ page }) => {
    await bootWithMockedApi(page)
    await routeSupabaseAuth(page) // 로그아웃 POST /auth/v1/logout 무해 처리

    // NavDrawer → 내 정보 → 로그아웃
    await openMenuItem(page, '내 정보')
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText(ME_FIXTURE.displayName)).toBeVisible()
    await sheet.getByRole('button', { name: '로그아웃' }).click()

    // 세션 파기 → 로그인 화면 복귀 + 지도·메뉴 미노출
    await expect(page.getByRole('button', { name: LOGIN_CTA })).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '메뉴' })).toHaveCount(0)
  })
})

// ── 로그인 실패 / 핸드오프 에러 (AC-7·8) ─────────────────────────────────────

test.describe('로그인 실패 / 준비 중', () => {
  test('AC-7: OAuth 시작 실패 → 핸드오프 에러 화면(㊹)·재시도 제공·크래시 없음', async ({
    page,
  }) => {
    // supabase 미구성(seedAuth:false → /api/config {})이면 signInWithKakao가 throw →
    // LoginView.onAuthError → App이 HandoffErrorView로 전이(AC-7: 실패 콜백 등가).
    await mockApi(page, { seedAuth: false, seedRegion: false })
    await page.goto('/')
    await page.getByRole('button', { name: LOGIN_CTA }).click()

    // 디자인된 핸드오프 에러 화면 + "다시 시도" 진입점
    await expect(page.getByRole('heading', { name: '연결에 실패했어요' })).toBeVisible()
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible()
    // 앱은 크래시 없이 살아 있다 — "다시 시도"로 로그인 화면 복귀 가능
    await page.getByRole('button', { name: '다시 시도' }).click()
    await expect(page.getByRole('button', { name: LOGIN_CTA })).toBeVisible()
  })

  test('AC-8: Apple·휴대폰 → "준비 중" 안내 + 세션 미수립(본문 미진입)', async ({ page }) => {
    await mockApi(page, { seedAuth: false, seedRegion: false })
    await page.goto('/')

    await page.getByRole('button', { name: 'Apple로 계속하기 (준비 중)' }).click()
    await expect(page.getByText(/준비 중이에요/)).toBeVisible()
    // 세션 미수립 — 로그인 화면 유지, 본문 미진입
    await expect(page.getByRole('button', { name: LOGIN_CTA })).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)

    // 휴대폰도 동일
    await page.getByRole('button', { name: '휴대폰 번호로 계속 (준비 중)' }).click()
    await expect(page.getByText(/준비 중이에요/)).toBeVisible()
    await expect(page.getByRole('button', { name: LOGIN_CTA })).toBeVisible()
  })
})

// ── 네이티브 토큰 핸드오프 (AC-13·14) ────────────────────────────────────────

test.describe('네이티브 핸드오프', () => {
  test('AC-13: 유효 핸드오프 토큰 주입 → 세션 수립·로그인 건너뜀', async ({ page }) => {
    // seedAuth:true로 supabase 클라이언트는 만들되, localStorage 세션은 비워(seedAuth가 심은 것 제거)
    // 핸드오프 토큰 주입 경로로만 세션이 서도록 한다. setSession은 토큰 exp(미만료) + /user 조회로 확정.
    await mockApi(page, { seedAuth: true, seedRegion: false })
    await routeSupabaseAuth(page)
    const token = fakeJwt()
    await page.addInitScript(
      ([storageKey, globalKey, accessToken]) => {
        localStorage.removeItem(storageKey) // 시드 세션 제거 — 핸드오프만이 세션 출처
        ;(window as unknown as Record<string, unknown>)[globalKey] = {
          accessToken,
          refreshToken: 'handoff-refresh',
          provider: 'kakao',
        }
      },
      [SUPABASE_SESSION_STORAGE_KEY, HANDOFF_GLOBAL_KEY, token] as const,
    )
    await page.goto('/')

    // 핸드오프로 세션 수립 → 로그인 화면을 건너뛰고 region 게이트로 진입(세션 있음의 가시 신호)
    await expect(page.getByRole('heading', { name: REGION_HEADING })).toBeVisible()
    await expect(page.getByRole('button', { name: LOGIN_CTA })).toHaveCount(0)
  })

  test('AC-14: 핸드오프 토큰 형식 오류 → 핸드오프 에러 화면(㊹) + 웹 카카오 폴백', async ({
    page,
  }) => {
    await mockApi(page, { seedAuth: true, seedRegion: false })
    await routeSupabaseAuth(page)
    await page.addInitScript(
      ([storageKey, globalKey]) => {
        localStorage.removeItem(storageKey)
        // 형식 오류 — handoffTokenSchema parse 실패(accessToken 누락) → AUTH_HANDOFF_MALFORMED
        ;(window as unknown as Record<string, unknown>)[globalKey] = { garbage: true }
      },
      [SUPABASE_SESSION_STORAGE_KEY, HANDOFF_GLOBAL_KEY] as const,
    )
    await page.goto('/')

    // 핸드오프 에러 화면 + 웹 카카오 폴백("다른 방법으로 로그인")
    await expect(page.getByRole('heading', { name: '연결에 실패했어요' })).toBeVisible()
    await expect(page.getByRole('button', { name: '다른 방법으로 로그인' })).toBeVisible()
  })

  test('AC-14: 핸드오프 토큰 만료 → 핸드오프 에러 화면(㊹)', async ({ page }) => {
    await mockApi(page, { seedAuth: true, seedRegion: false })
    await routeSupabaseAuth(page)
    await page.addInitScript(
      ([storageKey, globalKey]) => {
        localStorage.removeItem(storageKey)
        // expiresAt(epoch seconds) 과거 → AUTH_HANDOFF_EXPIRED
        ;(window as unknown as Record<string, unknown>)[globalKey] = {
          accessToken: 'expired-token',
          expiresAt: 1000, // 1970년대 — 만료
        }
      },
      [SUPABASE_SESSION_STORAGE_KEY, HANDOFF_GLOBAL_KEY] as const,
    )
    await page.goto('/')

    await expect(page.getByRole('heading', { name: '연결에 실패했어요' })).toBeVisible()
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible()
  })
})
