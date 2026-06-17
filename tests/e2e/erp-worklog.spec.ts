import { expect, test, type Page } from '@playwright/test'
import { bootWithMockedApi } from './helpers/mockApi'
import { computeWorkerCost } from '../../src/utils/workLogCost'

// 영농 ERP — 업무일지·일당계산 (docs/specs/erp-worklog.md, 슬라이스 5b)
// E2E 대상: AC-13·14·15 (클라이언트 PRO 진입·빈 상태·인력 선택 자동채움·실시간 합계·낙관 CRUD).
//
// 다른 AC는 하위 레이어가 커버 — E2E 중복 금지:
//  · AC-1~3 일당계산 순수 함수: tests/unit/utils/workLogCost.test.ts · tests/unit/erp/worklogDraft.test.ts
//  · AC-4 계약 스키마(zod): tests/unit/types/workLogs.test.ts
//  · AC-5~12 핸들러 CRUD·날짜순/기간필터·라인전체치환·하드삭제·무인증401·스냅샷보존·전역공유:
//    tests/integration/workLogs.test.ts (13/13 green)
//
// 부팅: 로그인 게이트(슬라이스2)+region 게이트(슬라이스1)는 bootWithMockedApi 기본
// seedAuth/seedRegion으로 통과(지도 직행). ERP 진입은 NavDrawer "영농 PRO" 섹션 경유.
// work-logs·staff 라우트는 mockApi가 상태 보존 모킹(생성·수정·하드삭제·기간필터·스냅샷 이름·totalCost 동형) 제공.
// 인건비 합계 기대값은 src/utils/workLogCost.ts(computeWorkerCost)로 도출 — 하드코딩 회피.

const STAFF_LABEL = '인력 관리'
const WORKLOG_LABEL = '업무일지'

const won = (n: number) => `${n.toLocaleString('ko')}원`

/** NavDrawer(메뉴)를 열고 PRO 섹션 항목을 탭해 뷰로 진입한다.
 *  항목명에 PRO 배지 텍스트가 붙어 접근명이 "<label> PRO"라 부분일치(exact 미지정)로 매칭한다. */
async function openProView(page: Page, label: string) {
  await page.getByRole('button', { name: '메뉴' }).click()
  await page.getByRole('button', { name: label }).click()
}

/**
 * 5a 인력 뷰에서 인력 1명을 추가한다(picker 소스 시드). 추가 후 뒤로 돌아간다.
 * mockApi staff 라우트가 상태 보존이라 이후 업무일지 뷰의 loadStaff가 이 인력을 본다(전역 공유).
 */
async function seedStaff(page: Page, name: string, dailyWage: number) {
  await openProView(page, STAFF_LABEL)
  const view = page.getByTestId('staff-view')
  // 헤더 "추가"는 목록 비었든 아니든 항상 노출(빈 상태 "인력 추가"는 첫 건 후 사라짐 — 다건 시드 안전)
  await view.getByRole('button', { name: '추가', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('이름').fill(name)
  await sheet.getByLabel('기본 일당').fill(String(dailyWage))
  await sheet.getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(view.getByText(name)).toBeVisible()
  // 뒤로 — 지도로 복귀(업무일지 진입은 다시 NavDrawer 경유)
  await view.getByRole('button', { name: '뒤로' }).click()
  await expect(page.getByTestId('staff-view')).toHaveCount(0)
}

// picker는 WorkLogSheet JSX 안에서 렌더되어 작성 시트 dialog의 자손이 된다.
// 따라서 dialog를 헤딩으로 filter하면 바깥(작성) dialog도 자손 헤딩 때문에 함께 매칭된다.
// 각 BottomSheet는 자체 <header>를 가지므로, 그 header를 가진 dialog로 정확히 좁힌다.

/** 업무일지 작성 시트(BottomSheet dialog) — 자체 header("업무일지 작성")로 picker와 구분 */
function worklogSheet(page: Page) {
  return page
    .getByRole('dialog')
    .filter({ has: page.locator('header').filter({ hasText: '업무일지 작성' }) })
}

/** 인력 선택 picker 시트 — 자체 header("인력 선택")로 작성 시트와 구분 */
function pickerSheet(page: Page) {
  return page
    .getByRole('dialog')
    .filter({ has: page.locator('header').filter({ hasText: '인력 선택' }) })
}

/** picker 닫기 — header("인력 선택") 안의 닫기 버튼만(자손 작성 시트 닫기와 구분) */
async function closePicker(page: Page) {
  await page.locator('header').filter({ hasText: '인력 선택' }).getByLabel('닫기').click()
  await expect(pickerSheet(page)).toHaveCount(0)
}

// ── AC-13: PRO 진입 → 빈 상태 + 작성 진입점 (게이팅 없음) ─────────────────────

test.describe('AC-13: NavDrawer PRO 섹션 → 업무일지 뷰 진입(빈 상태, 게이팅 없음)', () => {
  test('AC-13: 업무일지 항목 탭 시 잠금/페이월 없이 뷰가 열리고 EmptyState와 작성 진입점이 보인다', async ({
    page,
  }) => {
    await bootWithMockedApi(page)

    // PRO 섹션 "업무일지" 항목 존재 + 앰버 PRO 표식과 함께 배치
    await page.getByRole('button', { name: '메뉴' }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByRole('heading', { name: '영농 PRO' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: WORKLOG_LABEL })).toBeVisible()
    await drawer.getByRole('button', { name: WORKLOG_LABEL }).click()

    // 페이월·잠금 화면 없이 업무일지 뷰로 직행 (게이팅 강제 없음)
    const view = page.getByTestId('worklog-view')
    await expect(view).toBeVisible()
    await expect(view.getByRole('heading', { name: '업무일지' })).toBeVisible()

    // 데이터 0건 — EmptyState + 작성 진입점 둘 다 노출 (헤더 "작성" + 빈 상태 "첫 업무일지 작성")
    await expect(view.getByText('아직 작성된 업무일지가 없어요')).toBeVisible()
    await expect(view.getByRole('button', { name: '작성', exact: true })).toBeVisible()
    await expect(view.getByRole('button', { name: '첫 업무일지 작성' })).toBeVisible()
  })
})

// ── AC-14: 인력 선택 시 일당 자동채움 + 반일 프리셋 + 실시간 합계 일치 ──────────

test.describe('AC-14: 인력 자동채움 · 근무율 프리셋 · 실시간 합계', () => {
  test('AC-14: 인력 선택 시 기본 일당 자동채움 → 반일(0.5) 적용 → 라인·합계가 computeWorkerCost와 일치', async ({
    page,
  }) => {
    const WAGE = 150000
    await bootWithMockedApi(page)
    await seedStaff(page, '김작업', WAGE)

    await openProView(page, WORKLOG_LABEL)
    const view = page.getByTestId('worklog-view')
    await view.getByRole('button', { name: '작성', exact: true }).click()

    const sheet = worklogSheet(page)
    await expect(sheet.getByRole('heading', { name: '업무일지 작성' })).toBeVisible()

    // 인력 추가 picker → 김작업 선택
    await sheet.getByRole('button', { name: '인력 추가' }).click()
    const picker = pickerSheet(page)
    await picker.getByRole('button', { name: /김작업/ }).click()
    await closePicker(page)

    // 기본 일당 자동채움 (AC-14) — 라인 일당 입력에 마스터 dailyWage가 채워진다
    const wageInput = sheet.getByLabel('일당')
    await expect(wageInput).toHaveValue(String(WAGE))

    // 근무율 기본 = 전일(1.0) → 라인·합계 = computeWorkerCost(WAGE, 1.0)
    const fullCost = computeWorkerCost(WAGE, 1.0)
    const total = sheet.getByTestId('worklog-total')
    await expect(total).toHaveText(won(fullCost))

    // 프리셋 "반일"(0.5) 적용 → 라인 인건비가 일당의 절반, 합계도 일치
    await sheet.getByRole('button', { name: '반일', exact: true }).click()
    const halfCost = computeWorkerCost(WAGE, 0.5)
    expect(halfCost).toBe(Math.round(WAGE * 0.5)) // 75,000 — 일당의 절반
    // 라인 카드(인력명 "김작업" + 삭제 버튼 보유)의 인건비 표기 — total과 별개로 라인 합 검증
    const lineCard = sheet
      .locator('div')
      .filter({ has: page.getByRole('button', { name: '인력 삭제' }) })
      .filter({ hasText: '김작업' })
      .last()
    await expect(lineCard.getByText(won(halfCost))).toBeVisible() // 라인 합계
    await expect(total).toHaveText(won(halfCost)) // 화면 합계 = 라인 합
  })

  test('AC-14: 여러 인력·전일/연장 조합 합계 = Σ computeWorkerCost', async ({ page }) => {
    const WAGE_A = 150000
    const WAGE_B = 80000
    await bootWithMockedApi(page)
    await seedStaff(page, '김작업', WAGE_A)
    await seedStaff(page, '이작업', WAGE_B)

    await openProView(page, WORKLOG_LABEL)
    const view = page.getByTestId('worklog-view')
    await view.getByRole('button', { name: '작성', exact: true }).click()
    const sheet = worklogSheet(page)

    // 두 인력 모두 추가
    await sheet.getByRole('button', { name: '인력 추가' }).click()
    const picker = pickerSheet(page)
    await picker.getByRole('button', { name: /김작업/ }).click()
    await picker.getByRole('button', { name: /이작업/ }).click()
    await closePicker(page)

    // 두 라인 모두 전일(1.0) 기본 → 합계 = Σ computeWorkerCost(_, 1.0)
    const total = sheet.getByTestId('worklog-total')
    const sumFull = computeWorkerCost(WAGE_A, 1.0) + computeWorkerCost(WAGE_B, 1.0)
    await expect(total).toHaveText(won(sumFull))

    // 둘째 라인(이작업)을 "연장"(1.5)으로 변경 → 합계 재계산
    await sheet.getByRole('button', { name: '연장', exact: true }).nth(1).click()
    const sumMixed = computeWorkerCost(WAGE_A, 1.0) + computeWorkerCost(WAGE_B, 1.5)
    await expect(total).toHaveText(won(sumMixed))
    // 변경된 라인의 연장 인건비가 시트에 표기된다
    await expect(sheet.getByText(won(computeWorkerCost(WAGE_B, 1.5)))).toBeVisible()
  })
})

// ── AC-15: 저장(낙관 즉시 반영) → 삭제(하드, 낙관 즉시 제거) ───────────────────

test.describe('AC-15: 저장·삭제 낙관 업데이트', () => {
  test('AC-15: 저장 시 재조회 없이 목록 최상단에 합계와 함께 즉시 나타나고, 삭제 시 즉시 사라진다', async ({
    page,
  }) => {
    const WAGE = 150000
    await bootWithMockedApi(page)
    await seedStaff(page, '김작업', WAGE)

    await openProView(page, WORKLOG_LABEL)
    const view = page.getByTestId('worklog-view')
    await view.getByRole('button', { name: '작성', exact: true }).click()
    const sheet = worklogSheet(page)

    // 작업일(today 기본) · 제목 · 인력 입력
    await sheet.getByLabel('제목').fill('고추밭 정식')
    await sheet.getByRole('button', { name: '인력 추가' }).click()
    const picker = pickerSheet(page)
    await picker.getByRole('button', { name: /김작업/ }).click()
    await closePicker(page)

    // POST는 1회만(낙관 — 저장 직후 GET 재조회 없이 목록 반영)임을 검증
    let postCount = 0
    page.on('request', (req) => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/work-logs') postCount++
    })

    await sheet.getByRole('button', { name: '저장' }).click()

    // 시트가 닫히고 새 일지가 목록에 즉시 보인다 (낙관 — GET 재조회 대기 없음)
    await expect(worklogSheet(page)).toHaveCount(0)
    await expect(view.getByText('고추밭 정식')).toBeVisible()
    // 합계(전일 1.0) 표기 — 목록 행 + 헤더 합계
    const fullCost = computeWorkerCost(WAGE, 1.0)
    await expect(view.getByText(won(fullCost)).first()).toBeVisible()
    await expect(view.getByText('투입 1명')).toBeVisible()
    expect(postCount).toBe(1)

    // 삭제(하드, ConfirmInline 2단계) — 행을 탭해 수정 시트 진입
    await view.getByText('고추밭 정식').click()
    const editSheet = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: '업무일지 수정' }) })
    await expect(editSheet.getByRole('heading', { name: '업무일지 수정' })).toBeVisible()

    let deleteCount = 0
    page.on('request', (req) => {
      if (req.method() === 'DELETE' && new URL(req.url()).pathname.startsWith('/api/work-logs/'))
        deleteCount++
    })

    await editSheet.getByRole('button', { name: '삭제', exact: true }).click()
    await editSheet.getByRole('button', { name: '삭제 확정' }).click()

    // 시트가 닫히고 목록에서 즉시 사라진다 (하드 삭제 낙관)
    await expect(
      page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '업무일지 수정' }) }),
    ).toHaveCount(0)
    await expect(view.getByText('고추밭 정식')).toHaveCount(0)
    await expect(view.getByText('아직 작성된 업무일지가 없어요')).toBeVisible()
    expect(deleteCount).toBe(1)
  })
})
