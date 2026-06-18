import { expect, test, type Page } from '@playwright/test'
import { bootWithMockedApi } from './helpers/mockApi'

// 영농 ERP — 캘린더 (docs/specs/erp-calendar.md, 슬라이스 5d · A안 집계 뷰 전용)
// E2E 대상: AC-5·6·7·8·9·10·11 (PRO 진입·셀 마커·일 상세 날짜 스코프·드릴인·월 이동 재조회·빈 상태·전역 공유).
//
// AC-1~4(집계 순수 함수 groupByDate·summarizeDay·monthRange·buildMonthGrid)는
// tests/unit/erp/calendarAggregate.test.ts(18 케이스 green)가 1:1 커버 — E2E 중복 금지(spec 위임).
//
// 신규 라우트 없음(절충 2): 캘린더는 기존 5b work-logs·5c inventory/transactions list({from,to})를
// 재사용한다. mockApi의 work-logs·inventory/transactions 라우트는 상태 보존 모킹이라
// (빈 상태로 시작) 캘린더가 보는 날짜 데이터를 5b 작성 시트·5c 거래 시트로 UI 시드한다.
//
// 날짜 함정(절충 3): workDate·txnDate는 YYYY-MM-DD 로컬 문자열. 기대 날짜도 문자열로 단언한다
// (타임존 변환 금지). 셀·마커·항목 매핑은 전부 문자열 키(testid 포함)로 검증한다.
//
// "현재 달"은 실행 시점 new Date() 기준이라 날짜를 하드코딩하지 않고 그 달에서 도출한다
// (CalendarView는 todayYearMonth()로 진입하므로 부팅 직후 보이는 달 = 오늘이 속한 달).

// ── 날짜 헬퍼 (UTC 변환 없이 문자열 조립 — 절충 3 동형) ──────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

interface YearMonth {
  year: number
  month: number // 1-based
}

function todayYM(): YearMonth {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function shift({ year, month }: YearMonth, delta: number): YearMonth {
  const idx = year * 12 + (month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

/** 그 달의 YYYY-MM-DD (day는 1~28 안전 범위만 사용해 윤년·월말 함정 회피) */
function iso(ym: YearMonth, day: number): string {
  return `${ym.year}-${pad2(ym.month)}-${pad2(day)}`
}

/** monthRange 동형 — from/to 문자열(말일은 Date(year, month, 0)) */
function range(ym: YearMonth): { from: string; to: string } {
  const lastDay = new Date(ym.year, ym.month, 0).getDate()
  return { from: iso(ym, 1), to: `${ym.year}-${pad2(ym.month)}-${pad2(lastDay)}` }
}

// ── 진입 헬퍼 ───────────────────────────────────────────────────────────────

const CALENDAR_LABEL = '캘린더'
const WORKLOG_LABEL = '업무일지'
const INVENTORY_LABEL = '재고'

/** NavDrawer(메뉴)를 열고 PRO 섹션 항목을 탭해 뷰로 진입한다. 항목명에 PRO 배지가 붙어 부분일치 매칭. */
async function openProView(page: Page, label: string) {
  await page.getByRole('button', { name: '메뉴' }).click()
  await page.getByRole('button', { name: label }).click()
}

/**
 * 5b 업무일지 뷰로 들어가 지정 날짜·제목의 일지 1건을 작성한다(인력 없이 — 제목만으로 저장 가능).
 * mockApi work-logs 라우트가 상태 보존이라 이후 캘린더가 같은 달 조회 시 이 일지를 본다.
 * 작성 후 지도로 복귀(캘린더 진입은 다시 NavDrawer 경유).
 */
async function seedWorkLog(page: Page, workDate: string, title: string) {
  await openProView(page, WORKLOG_LABEL)
  const view = page.getByTestId('worklog-view')
  await view.getByRole('button', { name: '작성', exact: true }).click()
  const sheet = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: '업무일지 작성' }) })
  await sheet.getByLabel('작업일').fill(workDate)
  await sheet.getByLabel('제목').fill(title)
  await sheet.getByRole('button', { name: '저장' }).click()
  await expect(
    page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '업무일지 작성' }) }),
  ).toHaveCount(0)
  await expect(view.getByText(title)).toBeVisible()
  await view.getByRole('button', { name: '뒤로' }).click()
  await expect(page.getByTestId('worklog-view')).toHaveCount(0)
}

/**
 * 5c 재고 뷰로 들어가 품목 1건을 등록하고 지정 날짜·유형의 거래 1건을 작성한다(거래처 미연결).
 * mockApi inventory 라우트가 상태 보존이라 이후 캘린더가 같은 달 조회 시 이 거래를 본다.
 * 작성 후 지도로 복귀.
 */
async function seedTransaction(
  page: Page,
  opts: { itemName: string; unit: string; type: 'in' | 'out'; quantity: number; txnDate: string },
) {
  await openProView(page, INVENTORY_LABEL)
  const view = page.getByTestId('inventory-view')

  // 품목 등록 (빈 상태 "품목 추가" 또는 헤더 "품목")
  const emptyAdd = view.getByRole('button', { name: '품목 추가' })
  if (await emptyAdd.isVisible().catch(() => false)) await emptyAdd.click()
  else await view.getByRole('button', { name: '품목', exact: true }).click()
  const itemSheet = page.getByRole('dialog')
  await itemSheet.getByLabel('품목명').fill(opts.itemName)
  await itemSheet.getByLabel('단위').fill(opts.unit)
  await itemSheet.getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // 거래 이력 진입 → 거래 작성
  await view.getByRole('button', { name: `${opts.itemName} 거래 이력` }).click()
  const history = page.getByTestId('transaction-history')
  await history.getByRole('button', { name: '거래', exact: true }).click()
  const txnSheet = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: '입·출고 거래' }) })
  await txnSheet
    .getByRole('button', { name: opts.type === 'in' ? '입고' : '출고', exact: true })
    .click()
  await txnSheet.getByLabel('수량').fill(String(opts.quantity))
  await txnSheet.getByLabel('거래일').fill(opts.txnDate)
  await txnSheet.getByRole('button', { name: '거래 저장' }).click()
  await expect(
    page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '입·출고 거래' }) }),
  ).toHaveCount(0)
  await expect(history.getByText(opts.txnDate)).toBeVisible()

  // 이력 → 목록 → 지도로 복귀
  await history.getByRole('button', { name: '뒤로' }).click()
  await view.getByRole('button', { name: '뒤로' }).click()
  await expect(page.getByTestId('inventory-view')).toHaveCount(0)
}

/** NavDrawer로 캘린더 뷰를 연다 */
async function openCalendar(page: Page) {
  await openProView(page, CALENDAR_LABEL)
  await expect(page.getByTestId('calendar-view')).toBeVisible()
}

// ── AC-5: PRO 진입 → 현재 달 그리드 + 오늘 강조 (게이팅 없음) ──────────────────

test.describe('AC-5: NavDrawer PRO 섹션 → 캘린더 진입(현재 달·오늘 강조, 게이팅 없음)', () => {
  test('AC-5: 캘린더 항목 탭 시 잠금/페이월 없이 현재 달 그리드가 열리고 오늘 셀이 강조된다', async ({
    page,
  }) => {
    await bootWithMockedApi(page)

    // PRO 섹션에 "캘린더" 항목 존재 (앰버 PRO 표식과 함께)
    await page.getByRole('button', { name: '메뉴' }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByRole('heading', { name: '영농 PRO' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: CALENDAR_LABEL })).toBeVisible()
    await drawer.getByRole('button', { name: CALENDAR_LABEL }).click()

    // 페이월·잠금 없이 캘린더 뷰로 직행 + 월 그리드 표시
    const view = page.getByTestId('calendar-view')
    await expect(view).toBeVisible()
    await expect(view.getByRole('heading', { name: '캘린더' })).toBeVisible()
    await expect(view.getByTestId('month-grid')).toBeVisible()

    // 현재 달(오늘 기준)의 1일·말일 셀이 그리드에 존재 (문자열 키 직접 단언)
    const cur = todayYM()
    await expect(view.getByTestId(`day-cell-${iso(cur, 1)}`)).toBeVisible()
    const lastDay = new Date(cur.year, cur.month, 0).getDate()
    await expect(view.getByTestId(`day-cell-${cur.year}-${pad2(cur.month)}-${pad2(lastDay)}`)).toBeVisible()

    // 오늘 셀 강조 — data-today 속성을 가진 셀이 정확히 1개, 그 키가 오늘이다
    const todayCells = view.locator('[data-today="true"]')
    await expect(todayCells).toHaveCount(1)
    const d = new Date()
    const todayIso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    await expect(view.getByTestId(`day-cell-${todayIso}`)).toHaveAttribute('data-today', 'true')
  })
})

// ── AC-6: 항목 있는 날만 마커, 빈 날 무마킹 ──────────────────────────────────

test.describe('AC-6: 활동 마커는 항목 있는 날 셀에만', () => {
  test('AC-6: 업무일지·입고 날과 출고 날에만 마커가 보이고 빈 날 셀엔 마커가 없다', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    const cur = todayYM()
    const dayWorkIn = iso(cur, 12) // 업무일지 1 + 입고 1
    const dayOut = iso(cur, 20) // 출고 1
    const dayEmpty = iso(cur, 15) // 무항목

    // mockApi 빈 상태에 그 달 날짜 데이터 시드
    await seedWorkLog(page, dayWorkIn, '6/12 작업')
    await seedTransaction(page, {
      itemName: '요소비료',
      unit: '포',
      type: 'in',
      quantity: 10,
      txnDate: dayWorkIn,
    })
    await seedTransaction(page, {
      itemName: '살균제',
      unit: 'L',
      type: 'out',
      quantity: 3,
      txnDate: dayOut,
    })

    await openCalendar(page)
    const view = page.getByTestId('calendar-view')

    // 6/12 셀 — 업무일지·입고 마커가 보이고 출고 마커는 없다
    const cell12 = view.getByTestId(`day-cell-${dayWorkIn}`)
    await expect(cell12.getByTestId('marker-work')).toBeVisible()
    await expect(cell12.getByTestId('marker-in')).toBeVisible()
    await expect(cell12.getByTestId('marker-out')).toHaveCount(0)

    // 6/20 셀 — 출고 마커만
    const cell20 = view.getByTestId(`day-cell-${dayOut}`)
    await expect(cell20.getByTestId('marker-out')).toBeVisible()
    await expect(cell20.getByTestId('marker-work')).toHaveCount(0)
    await expect(cell20.getByTestId('marker-in')).toHaveCount(0)

    // 항목 없는 날 — 어떤 마커도 없다 (빈 날 무마킹)
    const cellEmpty = view.getByTestId(`day-cell-${dayEmpty}`)
    await expect(cellEmpty.getByTestId('marker-work')).toHaveCount(0)
    await expect(cellEmpty.getByTestId('marker-in')).toHaveCount(0)
    await expect(cellEmpty.getByTestId('marker-out')).toHaveCount(0)
  })
})

// ── AC-7: 일 상세 — 그날 항목만 (날짜 스코프) ───────────────────────────────

test.describe('AC-7: 날짜 셀 탭 → 그날 업무일지·거래 모아보기(날짜 스코프)', () => {
  test('AC-7: 6/12 셀 탭 시 그날 업무일지·입고가 함께 보이고 6/20 항목은 보이지 않는다', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    const cur = todayYM()
    const day12 = iso(cur, 12)
    const day20 = iso(cur, 20)

    await seedWorkLog(page, day12, '고추밭 정식')
    await seedTransaction(page, {
      itemName: '요소비료',
      unit: '포',
      type: 'in',
      quantity: 10,
      txnDate: day12,
    })
    await seedTransaction(page, {
      itemName: '상추',
      unit: 'kg',
      type: 'out',
      quantity: 50,
      txnDate: day20,
    })

    await openCalendar(page)
    const view = page.getByTestId('calendar-view')
    await view.getByTestId(`day-cell-${day12}`).click()

    const detail = page.getByTestId('day-detail')
    await expect(detail).toBeVisible()

    // 그날 업무일지 제목·거래(품목명) 함께 노출
    await expect(detail.getByText('고추밭 정식')).toBeVisible()
    await expect(detail.getByText('요소비료')).toBeVisible()

    // 날짜 스코프 — 6/20의 출고 품목(상추)은 이 패널에 없다
    await expect(detail.getByText('상추')).toHaveCount(0)
  })
})

// ── AC-8: 드릴인 — 업무일지 항목 탭 → 5b WorkLogSheet ─────────────────────────

test.describe('AC-8: 일 상세 업무일지 탭 → 기존 5b 편집 시트 진입', () => {
  test('AC-8: 업무일지 항목 탭 시 5b 업무일지 수정 시트가 열린다(새 편집 UI 없음)', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    const cur = todayYM()
    const day12 = iso(cur, 12)

    await seedWorkLog(page, day12, '드릴인 대상 일지')

    await openCalendar(page)
    const view = page.getByTestId('calendar-view')
    await view.getByTestId(`day-cell-${day12}`).click()

    const detail = page.getByTestId('day-detail')
    // 일 상세 업무일지 항목 탭 → 5b WorkLogSheet(수정)
    await detail.getByText('드릴인 대상 일지').click()

    const editSheet = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: '업무일지 수정' }) })
    await expect(editSheet.getByRole('heading', { name: '업무일지 수정' })).toBeVisible()
    // 드릴인 시트가 그 일지 데이터를 담고 있다(제목·작업일)
    await expect(editSheet.getByLabel('제목')).toHaveValue('드릴인 대상 일지')
    await expect(editSheet.getByLabel('작업일')).toHaveValue(day12)
  })
})

test.describe('AC-8: 일 상세 거래 행 탭 → 5c 재고 뷰 드릴인(풀스크린 상호배타·z-stack 정상)', () => {
  test('AC-8: 거래 행 탭 시 재고 뷰가 실제로 보이고 캘린더 뷰는 더 이상 보이지 않는다(가림 회귀 방지)', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    const cur = todayYM()
    const day12 = iso(cur, 12)

    // 거래(입고)가 있는 날 시드
    await seedTransaction(page, {
      itemName: '요소비료',
      unit: '포',
      type: 'in',
      quantity: 10,
      txnDate: day12,
    })

    await openCalendar(page)
    const view = page.getByTestId('calendar-view')
    await view.getByTestId(`day-cell-${day12}`).click()

    const detail = page.getByTestId('day-detail')
    await expect(detail).toBeVisible()
    // 일 상세에 거래 행이 보인다(품목명 스냅샷)
    await expect(detail.getByText('요소비료')).toBeVisible()

    // 거래 행 탭 → 일 상세·캘린더 닫힘 + 5c 재고 뷰 진입(드릴인 죽은 경로/가림 회귀 방지)
    await detail.locator('[data-testid^="day-txn-"]').first().click()

    // 인벤토리 뷰가 시각적으로 보인다(단순 라우트 호출이 아니라 실제 표시 단언)
    const inventory = page.getByTestId('inventory-view')
    await expect(inventory).toBeVisible()
    await expect(inventory.getByRole('heading', { name: '재고' })).toBeVisible()
    // 드릴인 대상 품목이 재고 목록에 보인다
    await expect(inventory.getByText('요소비료')).toBeVisible()

    // 풀스크린 뷰 상호배타 — 캘린더 뷰는 더 이상 보이지 않는다(z-stack 가림 해소)
    await expect(page.getByTestId('calendar-view')).toHaveCount(0)
    await expect(page.getByTestId('calendar-view')).not.toBeVisible()
    // 일 상세 시트도 닫혀 있다
    await expect(page.getByTestId('day-detail')).toHaveCount(0)
  })
})

// ── AC-9: 월 이동 재조회(?from&to 변경) + "오늘로" 복귀 ──────────────────────

test.describe('AC-9: 월 이동 시 해당 월 범위로 재조회 + 오늘로 복귀', () => {
  test('AC-9: 다음 달 이동 시 그 달 범위(from/to)로 재조회되고 데이터가 달라지며, 오늘로 복귀 시 오늘 셀이 강조된다', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    const cur = todayYM()
    const next = shift(cur, 1)
    const curDay = iso(cur, 10)
    const nextDay = iso(next, 14)

    // 현재 달·다음 달에 각각 다른 업무일지 시드 (월 이동으로 데이터 차이 확인)
    await seedWorkLog(page, curDay, '이번달 작업')
    await seedWorkLog(page, nextDay, '다음달 작업')

    // 다음 달 조회 요청의 ?from&to를 가로채 검증
    const nextRange = range(next)
    const nextWorkLogReq = page.waitForRequest((req) => {
      if (req.method() !== 'GET') return false
      const u = new URL(req.url())
      return (
        u.pathname === '/api/work-logs' &&
        u.searchParams.get('from') === nextRange.from &&
        u.searchParams.get('to') === nextRange.to
      )
    })
    const nextTxnReq = page.waitForRequest((req) => {
      if (req.method() !== 'GET') return false
      const u = new URL(req.url())
      return (
        u.pathname === '/api/inventory/transactions' &&
        u.searchParams.get('from') === nextRange.from &&
        u.searchParams.get('to') === nextRange.to
      )
    })

    await openCalendar(page)
    const view = page.getByTestId('calendar-view')

    // 현재 달 — 이번달 작업 셀에 마커
    await expect(view.getByTestId(`day-cell-${curDay}`).getByTestId('marker-work')).toBeVisible()

    // 다음 달로 이동
    await view.getByRole('button', { name: '다음 달' }).click()
    await nextWorkLogReq
    await nextTxnReq

    // 다음 달 그리드 — 다음달 작업 셀에 마커가 보이고, 이번달 셀(이전 달이라 그리드에 없음)은 사라진다
    await expect(view.getByTestId(`day-cell-${nextDay}`).getByTestId('marker-work')).toBeVisible()
    await expect(view.getByTestId(`day-cell-${curDay}`)).toHaveCount(0)

    // "오늘"로 복귀 → 현재 달로 돌아오고 오늘 셀이 강조된다
    await view.getByRole('button', { name: '오늘' }).click()
    const todayCells = view.locator('[data-today="true"]')
    await expect(todayCells).toHaveCount(1)
    await expect(view.getByTestId(`day-cell-${curDay}`).getByTestId('marker-work')).toBeVisible()
  })
})

// ── AC-10: 빈 달 — 마커 0 + 빈 날 탭 시 EmptyState ───────────────────────────

test.describe('AC-10: 항목 없는 달 — 마커 0, 빈 날 일 상세 EmptyState', () => {
  test('AC-10: 아무 데이터도 없는 현재 달엔 마커가 하나도 없고, 빈 날 탭 시 일 상세가 "기록 없음"으로 열린다', async ({
    page,
  }) => {
    await bootWithMockedApi(page) // 시드 없음 → work-logs·transactions 빈 상태
    const cur = todayYM()

    await openCalendar(page)
    const view = page.getByTestId('calendar-view')
    // 달력 자체는 정상 표시
    await expect(view.getByTestId('month-grid')).toBeVisible()

    // 어떤 셀에도 마커가 없다
    await expect(view.getByTestId('marker-work')).toHaveCount(0)
    await expect(view.getByTestId('marker-in')).toHaveCount(0)
    await expect(view.getByTestId('marker-out')).toHaveCount(0)

    // 빈 날짜 탭 → 일 상세가 빈 상태(EmptyState)로 열림 (에러 아님)
    await view.getByTestId(`day-cell-${iso(cur, 15)}`).click()
    const detail = page.getByTestId('day-detail')
    await expect(detail).toBeVisible()
    await expect(detail.getByText('이 날엔 기록이 없어요')).toBeVisible()
  })
})

// ── AC-11: 전역 공유 — 다른 created_by 항목도 같은 달력에 표시 ─────────────────

test.describe('AC-11: 전역 공유 — 다른 사용자가 만든 항목도 같은 달력에 보인다', () => {
  test('AC-11: A가 만든 업무일지·거래가 B 세션 캘린더에도 마커·일 상세로 나타난다(created_by 격리 없음)', async ({
    page,
  }) => {
    // mockApi work-logs·inventory 라우트는 created_by를 격리하지 않는다(전역 공유 단일 테이블).
    // 따라서 UI로 시드한 항목(= 사용자 A 작성분)이 같은 세션의 캘린더 조회에 그대로 보인다 —
    // 서버가 created_by와 무관하게 동일 목록을 반환하는 전역 공유 동형을 검증한다.
    await bootWithMockedApi(page)
    const cur = todayYM()
    const day12 = iso(cur, 12)

    // "사용자 A"가 만든 항목 (mockApi createdBy=SEED_USER_ID 고정 — 누구 조회든 같은 목록)
    await seedWorkLog(page, day12, 'A가 적은 업무일지')
    await seedTransaction(page, {
      itemName: '복합비료',
      unit: '포',
      type: 'in',
      quantity: 5,
      txnDate: day12,
    })

    await openCalendar(page)
    const view = page.getByTestId('calendar-view')

    // 6/12 셀에 마커가 보인다 (A의 항목이 격리 없이 노출)
    const cell12 = view.getByTestId(`day-cell-${day12}`)
    await expect(cell12.getByTestId('marker-work')).toBeVisible()
    await expect(cell12.getByTestId('marker-in')).toBeVisible()

    // 일 상세에 A의 항목이 그대로 나타난다
    await cell12.click()
    const detail = page.getByTestId('day-detail')
    await expect(detail.getByText('A가 적은 업무일지')).toBeVisible()
    await expect(detail.getByText('복합비료')).toBeVisible()
  })
})
