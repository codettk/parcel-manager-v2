import { expect, test, type Page } from '@playwright/test'
import { bootWithMockedApi } from './helpers/mockApi'

// 영농 ERP — 인력·거래처 마스터 (docs/specs/erp-staff-contacts.md, 슬라이스 5a)
// E2E 대상: AC-12·13·14·15 (클라이언트 목록·시트·낙관 업데이트·PRO 진입점).
// AC-1~11(핸들러 CRUD·active 필터·소프트삭제·무인증 401·전역 공유)은 핸들러 통합테스트
// tests/integration/staff.test.ts·tests/integration/contacts.test.ts(20/20)가 커버 — E2E 중복 금지.
//
// 부팅: 로그인 게이트(슬라이스2)+region 게이트(슬라이스1)는 bootWithMockedApi의 기본
// seedAuth/seedRegion으로 통과(지도 직행). ERP 진입은 NavDrawer "영농 PRO" 섹션 경유.
// staff·contacts 라우트는 mockApi가 상태 보존 모킹(includeInactive 필터·소프트 비활성 동형) 제공.

const STAFF_LABEL = '인력 관리'
const CONTACTS_LABEL = '거래처 관리'

/** NavDrawer(메뉴)를 열고 PRO 섹션 항목을 탭해 뷰로 진입한다. 항목명에 PRO 배지 텍스트가 붙어
 *  접근명이 "<label> PRO"라 부분일치(exact 미지정)로 매칭한다(openMenuItem은 exact라 부적합). */
async function openProView(page: Page, label: string) {
  await page.getByRole('button', { name: '메뉴' }).click()
  await page.getByRole('button', { name: label }).click()
}

// ── AC-12: 빈 상태 진입 ───────────────────────────────────────────────────────

test.describe('AC-12: PRO 섹션 진입 → 빈 상태', () => {
  test('AC-12: 인력 뷰 — 데이터 0건이면 EmptyState와 추가 진입점이 표시된다', async ({ page }) => {
    await bootWithMockedApi(page)
    await openProView(page, STAFF_LABEL)

    const view = page.getByTestId('staff-view')
    await expect(view).toBeVisible()
    await expect(view.getByText('등록된 인력이 없어요')).toBeVisible()
    // 추가 진입점: 헤더 "추가" + 빈 상태 액션 "인력 추가" 둘 다 존재
    await expect(view.getByRole('button', { name: '추가', exact: true })).toBeVisible()
    await expect(view.getByRole('button', { name: '인력 추가' })).toBeVisible()
  })

  test('AC-12: 거래처 뷰 — 데이터 0건이면 EmptyState와 추가 진입점이 표시된다', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    await openProView(page, CONTACTS_LABEL)

    const view = page.getByTestId('contacts-view')
    await expect(view).toBeVisible()
    await expect(view.getByText('등록된 거래처가 없어요')).toBeVisible()
    await expect(view.getByRole('button', { name: '추가', exact: true })).toBeVisible()
    await expect(view.getByRole('button', { name: '거래처 추가' })).toBeVisible()
  })
})

// ── AC-13: 추가 시트 입력·저장 → 낙관 즉시 반영 ──────────────────────────────

test.describe('AC-13: 추가 → 낙관 업데이트', () => {
  test('AC-13: 인력 — 이름·일당 입력·저장 시 재조회 없이 목록에 즉시 나타난다', async ({ page }) => {
    await bootWithMockedApi(page)
    await openProView(page, STAFF_LABEL)
    const view = page.getByTestId('staff-view')

    await view.getByRole('button', { name: '인력 추가' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: '인력 추가' })).toBeVisible()

    await sheet.getByLabel('이름').fill('홍길동')
    await sheet.getByLabel('기본 일당').fill('120000')

    // POST는 한 번만(낙관 — 저장 직후 재조회 GET 없이 목록 반영)임을 검증하기 위해 호출을 카운트
    let staffPostCount = 0
    page.on('request', (req) => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/staff') staffPostCount++
    })

    await sheet.getByRole('button', { name: '저장' }).click()

    // 시트가 닫히고 새 인력이 목록에 즉시 보인다 (낙관 — GET 재조회 대기 없음)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(view.getByText('홍길동')).toBeVisible()
    // 일당 천단위 포맷(formatWage) 렌더 확인
    await expect(view.getByText('120,000원')).toBeVisible()
    expect(staffPostCount).toBe(1)
  })

  test('AC-13: 거래처 — 이름·kind(매출) 선택·저장 시 즉시 목록에 나타난다', async ({ page }) => {
    await bootWithMockedApi(page)
    await openProView(page, CONTACTS_LABEL)
    const view = page.getByTestId('contacts-view')

    await view.getByRole('button', { name: '거래처 추가' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: '거래처 추가' })).toBeVisible()

    await sheet.getByLabel('상호').fill('대한농협')
    // kind 선택(SegmentedControl) — 매출 선택
    await sheet.getByRole('button', { name: '매출', exact: true }).click()
    await expect(sheet.getByRole('button', { name: '매출', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await sheet.getByRole('button', { name: '저장' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    const row = view.getByText('대한농협')
    await expect(row).toBeVisible()
    // kind 배지(매출)가 행에 노출
    await expect(view.getByText('매출', { exact: true })).toBeVisible()
  })
})

// ── AC-14: 소프트삭제(비활성) → 토글 → 재활성화 ──────────────────────────────

test.describe('AC-14: 소프트 비활성 → 비활성 포함 토글 → 재활성화', () => {
  test('AC-14: 인력 비활성 시 기본 목록에서 사라지고, 토글로 재노출 후 재활성화된다', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    await openProView(page, STAFF_LABEL)
    const view = page.getByTestId('staff-view')

    // 선결: 인력 1건 추가
    await view.getByRole('button', { name: '인력 추가' }).click()
    let sheet = page.getByRole('dialog')
    await sheet.getByLabel('이름').fill('김작업')
    await sheet.getByRole('button', { name: '저장' }).click()
    await expect(view.getByText('김작업')).toBeVisible()

    // 비활성: 행을 탭해 수정 시트 → ConfirmInline 2단계
    await view.getByText('김작업').click()
    sheet = page.getByRole('dialog')
    await sheet.getByRole('button', { name: '비활성', exact: true }).click()
    await sheet.getByRole('button', { name: '비활성 처리' }).click()

    // 기본 목록(active만)에서 즉시 사라진다 (낙관)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(view.getByText('김작업')).toHaveCount(0)

    // "비활성 포함 보기" 토글 → 재노출 + 재활성화 진입점
    const toggle = view.getByRole('switch')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(view.getByText('김작업')).toBeVisible()

    const reactivate = view.getByRole('button', { name: '재활성화' })
    await expect(reactivate).toBeVisible()
    await reactivate.click()

    // 재활성화 후: 토글을 다시 끄면 활성 목록에 다시 보인다
    await expect(view.getByRole('button', { name: '재활성화' })).toHaveCount(0)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(view.getByText('김작업')).toBeVisible()
  })

  test('AC-14: 거래처 비활성 → 토글 재노출 → 재활성화 (인력 동형)', async ({ page }) => {
    await bootWithMockedApi(page)
    await openProView(page, CONTACTS_LABEL)
    const view = page.getByTestId('contacts-view')

    await view.getByRole('button', { name: '거래처 추가' }).click()
    let sheet = page.getByRole('dialog')
    await sheet.getByLabel('상호').fill('남도종묘')
    await sheet.getByRole('button', { name: '저장' }).click()
    await expect(view.getByText('남도종묘')).toBeVisible()

    await view.getByText('남도종묘').click()
    sheet = page.getByRole('dialog')
    await sheet.getByRole('button', { name: '비활성', exact: true }).click()
    await sheet.getByRole('button', { name: '비활성 처리' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(view.getByText('남도종묘')).toHaveCount(0)

    const toggle = view.getByRole('switch')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(view.getByText('남도종묘')).toBeVisible()

    await view.getByRole('button', { name: '재활성화' }).click()
    await expect(view.getByRole('button', { name: '재활성화' })).toHaveCount(0)
    await toggle.click()
    await expect(view.getByText('남도종묘')).toBeVisible()
  })
})

// ── AC-15: PRO 진입점 — 앰버 표식 + 게이팅 없이 직행 ──────────────────────────

test.describe('AC-15: NavDrawer PRO 섹션 진입점', () => {
  test('AC-15: 인력·거래처가 "영농 PRO" 섹션에 앰버 PRO 표식과 함께 배치된다', async ({ page }) => {
    await bootWithMockedApi(page)
    await page.getByRole('button', { name: '메뉴' }).click()

    const drawer = page.getByRole('dialog')
    // 별도 "영농 PRO" 섹션 존재
    await expect(drawer.getByRole('heading', { name: '영농 PRO' })).toBeVisible()
    // PRO 항목 전부 표식 보유 (인력·거래처 + 5b 업무일지 + 5c 재고 + 5d 캘린더 = 배지 5개)
    await expect(drawer.getByText('PRO', { exact: true })).toHaveCount(5)
    await expect(drawer.getByRole('button', { name: STAFF_LABEL })).toBeVisible()
    await expect(drawer.getByRole('button', { name: CONTACTS_LABEL })).toBeVisible()
    await expect(drawer.getByRole('button', { name: '업무일지' })).toBeVisible()

    // PRO 배지 색이 앰버 토큰(#D69021)인지 — 토큰→픽셀 적용 교차 검증
    const badge = drawer.getByText('PRO', { exact: true }).first()
    const color = await badge.evaluate((el) => getComputedStyle(el).color)
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
    expect(m).not.toBeNull()
    if (m === null) throw new Error('PRO 배지 색 파싱 실패')
    expect(Math.abs(Number(m[1]) - 0xd6)).toBeLessThanOrEqual(4)
    expect(Math.abs(Number(m[2]) - 0x90)).toBeLessThanOrEqual(4)
    expect(Math.abs(Number(m[3]) - 0x21)).toBeLessThanOrEqual(4)
  })

  test('AC-15: 인력 항목 탭 시 잠금/페이월 없이 곧바로 뷰가 열린다 (게이팅 강제 없음)', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    await openProView(page, STAFF_LABEL)
    // 페이월·잠금 화면 없이 인력 뷰로 직행
    await expect(page.getByTestId('staff-view')).toBeVisible()
    await expect(page.getByRole('heading', { name: '인력 관리' })).toBeVisible()
  })

  test('AC-15: 거래처 항목 탭 시 잠금/페이월 없이 곧바로 뷰가 열린다', async ({ page }) => {
    await bootWithMockedApi(page)
    await openProView(page, CONTACTS_LABEL)
    await expect(page.getByTestId('contacts-view')).toBeVisible()
    await expect(page.getByRole('heading', { name: '거래처 관리' })).toBeVisible()
  })
})
