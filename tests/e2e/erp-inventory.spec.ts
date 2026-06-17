import { expect, test, type Page } from '@playwright/test'
import { bootWithMockedApi } from './helpers/mockApi'
import { computeItemBalance } from '../../src/utils/stockBalance'
import { formatQty } from '../../src/features/erp/inventory/format'

// 영농 ERP — 재고 관리 (docs/specs/erp-inventory.md, 슬라이스 5c)
// E2E 대상: AC-16·17·18 (클라이언트 PRO 진입·빈 상태·현재고 표시/낙관 증감·거래처 연결/미연결 저장).
//
// 다른 AC는 하위 레이어가 커버 — E2E 중복 금지:
//  · AC-1·2 현재고 순수 함수(computeItemBalance·computeBalances): tests/unit/utils/stockBalance.test.ts
//  · AC-3 숫자 draft 정규화(sanitizeDecimalInput·toRecipeNumber 재사용): tests/unit/erp/inventoryFormat.test.ts
//  · AC-4 계약 스키마(zod): tests/unit/types/inventory.test.ts
//  · AC-5~15 핸들러 CRUD·active 필터·소프트삭제/거래 생성(스냅샷·연결·미연결·정합 느슨)·
//    itemId/기간 필터·하드삭제+현재고 재계산·무인증401·스냅샷보존·전역공유:
//    tests/integration/inventoryItems.test.ts · tests/integration/inventoryTransactions.test.ts (24/24 green)
//
// 부팅: 로그인 게이트(슬라이스2)+region 게이트(슬라이스1)는 bootWithMockedApi 기본
// seedAuth/seedRegion으로 통과(지도 직행). ERP 진입은 NavDrawer "영농 PRO" 섹션 경유.
// inventory/items·inventory/transactions·contacts 라우트는 mockApi가 상태 보존 모킹
// (스냅샷·amount=quantity×unitPrice 서버 동형·소프트비활성·하드삭제·itemId/기간 필터) 제공.
// 현재고 기대값은 src/utils/stockBalance.ts(computeItemBalance)로 도출 — 하드코딩 회피.

const INVENTORY_LABEL = '재고'
const CONTACTS_LABEL = '거래처 관리'

/** NavDrawer(메뉴)를 열고 PRO 섹션 항목을 탭해 뷰로 진입한다. 항목명에 PRO 배지 텍스트가 붙어
 *  접근명이 "<label> PRO"라 부분일치(exact 미지정)로 매칭한다. */
async function openProView(page: Page, label: string) {
  await page.getByRole('button', { name: '메뉴' }).click()
  await page.getByRole('button', { name: label }).click()
}

/**
 * 5a 거래처 뷰에서 활성 거래처 1건을 추가한다(picker 소스 시드). 추가 후 지도로 복귀.
 * mockApi contacts 라우트가 상태 보존이라 이후 거래 작성 시트의 picker가 이 거래처를 본다(전역 공유).
 */
async function seedContact(page: Page, name: string) {
  await openProView(page, CONTACTS_LABEL)
  const view = page.getByTestId('contacts-view')
  // 헤더 "추가"는 목록 비었든 아니든 항상 노출
  await view.getByRole('button', { name: '추가', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('상호').fill(name)
  await sheet.getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(view.getByText(name)).toBeVisible()
  // 뒤로 — 지도로 복귀(재고 진입은 다시 NavDrawer 경유)
  await view.getByRole('button', { name: '뒤로' }).click()
  await expect(page.getByTestId('contacts-view')).toHaveCount(0)
}

/** 재고 뷰에서 품목 1건을 등록한다. 등록 후 그 품목 행이 목록에 보인다. */
async function seedItem(page: Page, name: string, unit: string) {
  const view = page.getByTestId('inventory-view')
  // 빈 상태(첫 건) "품목 추가" 또는 헤더 "품목" — 빈 상태 진입점을 우선 사용(첫 건)
  const emptyAdd = view.getByRole('button', { name: '품목 추가' })
  if (await emptyAdd.isVisible().catch(() => false)) await emptyAdd.click()
  else await view.getByRole('button', { name: '품목', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('heading', { name: '품목 추가' })).toBeVisible()
  await sheet.getByLabel('품목명').fill(name)
  await sheet.getByLabel('단위').fill(unit)
  await sheet.getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(view.getByText(name)).toBeVisible()
}

/** 입·출고 거래 작성 시트(BottomSheet dialog) — 자체 heading("입·출고 거래")로 picker와 구분 */
function txnSheet(page: Page) {
  return page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: '입·출고 거래' }) })
}

/**
 * 품목별 거래 이력 뷰에서 입·출고 거래 1건을 작성한다(낙관 즉시 반영).
 * type: 'in'(입고)·'out'(출고), contactName 지정 시 picker에서 선택(미지정이면 미연결).
 */
async function addTransaction(
  page: Page,
  opts: {
    type: 'in' | 'out'
    quantity: number
    txnDate?: string
    contactName?: string
    unitPrice?: number
  },
) {
  const history = page.getByTestId('transaction-history')
  await history.getByRole('button', { name: '거래', exact: true }).click()
  const sheet = txnSheet(page)
  await expect(sheet.getByRole('heading', { name: '입·출고 거래' })).toBeVisible()

  await sheet.getByRole('button', { name: opts.type === 'in' ? '입고' : '출고', exact: true }).click()
  await sheet.getByLabel('수량').fill(String(opts.quantity))
  if (opts.txnDate !== undefined) await sheet.getByLabel('거래일').fill(opts.txnDate)
  if (opts.unitPrice !== undefined) await sheet.getByLabel('단가').fill(String(opts.unitPrice))
  if (opts.contactName !== undefined) {
    await sheet.getByRole('button', { name: '거래처 선택' }).click()
    const picker = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: '거래처 선택' }) })
    await picker.getByRole('button', { name: new RegExp(opts.contactName) }).click()
    // 선택 즉시 picker가 닫힌다
    await expect(
      page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '거래처 선택' }) }),
    ).toHaveCount(0)
  }
  await sheet.getByRole('button', { name: '거래 저장' }).click()
  await expect(txnSheet(page)).toHaveCount(0)
}

// ── AC-16: PRO 진입 → 빈 상태(게이팅 없음) + 품목 추가 진입점 ──────────────────

test.describe('AC-16: NavDrawer PRO 섹션 → 재고 뷰 진입(빈 상태, 게이팅 없음)', () => {
  test('AC-16: 재고 항목 탭 시 잠금/페이월 없이 뷰가 열리고 EmptyState와 품목 추가 진입점이 보인다', async ({
    page,
  }) => {
    await bootWithMockedApi(page)

    // PRO 섹션 "재고" 항목 존재 + 앰버 PRO 표식과 함께 배치
    await page.getByRole('button', { name: '메뉴' }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByRole('heading', { name: '영농 PRO' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: INVENTORY_LABEL })).toBeVisible()
    await drawer.getByRole('button', { name: INVENTORY_LABEL }).click()

    // 페이월·잠금 화면 없이 재고 뷰로 직행 (게이팅 강제 없음)
    const view = page.getByTestId('inventory-view')
    await expect(view).toBeVisible()
    await expect(view.getByRole('heading', { name: '재고' })).toBeVisible()

    // 품목 0건 — EmptyState + 추가 진입점 둘 다 노출 (헤더 "품목" + 빈 상태 "품목 추가")
    await expect(view.getByText('아직 등록된 품목이 없어요')).toBeVisible()
    await expect(view.getByRole('button', { name: '품목', exact: true })).toBeVisible()
    await expect(view.getByRole('button', { name: '품목 추가' })).toBeVisible()
  })
})

// ── AC-17: 현재고 표시 · 입고/출고 낙관 증감 · 삭제 원복 · 음수 ──────────────────

test.describe('AC-17: 현재고 합산 파생 표시 + 낙관 증감/삭제 원복', () => {
  test('AC-17: 입고 100 → 현재고 100, 출고 30 추가 → 현재고 70(낙관), 출고 삭제 → 현재고 100 원복', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    await openProView(page, INVENTORY_LABEL)
    const view = page.getByTestId('inventory-view')

    await seedItem(page, '요소비료', '포')

    // 품목 행 → 거래 이력 진입
    await view.getByRole('button', { name: '요소비료 거래 이력' }).click()
    const history = page.getByTestId('transaction-history')
    await expect(history).toBeVisible()

    // 거래 0건 — 현재고 0
    const expect0 = computeItemBalance([])
    await expect(history.getByTestId('history-balance')).toHaveText(
      `${formatQty(expect0)} 포`,
    )

    // 입고 100 → 현재고 100 (낙관 즉시)
    await addTransaction(page, { type: 'in', quantity: 100, txnDate: '2026-06-01' })
    const after100 = computeItemBalance([{ itemId: 'x', type: 'in', quantity: 100 }])
    await expect(history.getByTestId('history-balance')).toHaveText(
      `${formatQty(after100)} 포`,
    )
    expect(after100).toBe(100)

    // 출고 30 추가 → 현재고 70 (재조회 없이 낙관 감소)
    await addTransaction(page, { type: 'out', quantity: 30, txnDate: '2026-06-02' })
    const after70 = computeItemBalance([
      { itemId: 'x', type: 'in', quantity: 100 },
      { itemId: 'x', type: 'out', quantity: 30 },
    ])
    expect(after70).toBe(70)
    await expect(history.getByTestId('history-balance')).toHaveText(
      `${formatQty(after70)} 포`,
    )
    // 두 거래가 거래일 내림차순으로 이력에 노출 (06-02가 위)
    await expect(history.getByText('2026-06-02')).toBeVisible()
    await expect(history.getByText('2026-06-01')).toBeVisible()

    // 출고 30 거래 하드 삭제(ConfirmInline 2단계) → 현재고 100 자동 원복(파생)
    let deleteCount = 0
    page.on('request', (req) => {
      if (
        req.method() === 'DELETE' &&
        new URL(req.url()).pathname.startsWith('/api/inventory/transactions/')
      )
        deleteCount++
    })
    const outRow = history
      .locator('div')
      .filter({ hasText: '2026-06-02' })
      .filter({ has: page.getByRole('button', { name: '삭제', exact: true }) })
      .last()
    await outRow.getByRole('button', { name: '삭제', exact: true }).click()
    await outRow.getByRole('button', { name: '삭제 확정' }).click()

    // 출고 거래가 즉시 사라지고 현재고가 100으로 원복
    await expect(history.getByText('2026-06-02')).toHaveCount(0)
    await expect(history.getByTestId('history-balance')).toHaveText(
      `${formatQty(after100)} 포`,
    )
    expect(deleteCount).toBe(1)
  })

  test('AC-17: 초과 출고 시 음수 현재고가 경고와 함께 그대로 표시된다(차단 없음)', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    await openProView(page, INVENTORY_LABEL)
    const view = page.getByTestId('inventory-view')

    await seedItem(page, '살균제', 'L')
    await view.getByRole('button', { name: '살균제 거래 이력' }).click()
    const history = page.getByTestId('transaction-history')

    // 입고 5 · 출고 8 → 현재고 -3 (음수 허용, 절충 1)
    await addTransaction(page, { type: 'in', quantity: 5, txnDate: '2026-06-01' })
    await addTransaction(page, { type: 'out', quantity: 8, txnDate: '2026-06-02' })

    const negative = computeItemBalance([
      { itemId: 'x', type: 'in', quantity: 5 },
      { itemId: 'x', type: 'out', quantity: 8 },
    ])
    expect(negative).toBe(-3)
    await expect(history.getByTestId('history-balance')).toHaveText(
      `${formatQty(negative)} L`,
    )

    // 뒤로 — 품목 목록 행에서도 음수 현재고 + 경고 표식이 보인다
    await history.getByRole('button', { name: '뒤로' }).click()
    await expect(history).toHaveCount(0)
    await expect(view.getByTestId('item-balance')).toHaveText(formatQty(negative))
    await expect(view.getByText('재고 음수')).toBeVisible()
  })
})

// ── AC-18: 거래처 연결 저장 · 미연결 저장 · 단가→금액 자동 ─────────────────────

test.describe('AC-18: 거래처 연결/미연결 저장 + 단가→금액 자동', () => {
  test('AC-18: 매입처를 선택해 입고 저장 시 거래처 상호가 이력에 표시되고 단가 입력 시 금액이 자동 산출된다', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    await seedContact(page, '대한농협')

    await openProView(page, INVENTORY_LABEL)
    const view = page.getByTestId('inventory-view')
    await seedItem(page, '요소비료', '포')
    await view.getByRole('button', { name: '요소비료 거래 이력' }).click()
    const history = page.getByTestId('transaction-history')

    // 작성 시트에서 단가 입력 → 금액 자동(미리보기) 확인 후 저장
    await history.getByRole('button', { name: '거래', exact: true }).click()
    const sheet = txnSheet(page)
    await sheet.getByRole('button', { name: '입고', exact: true }).click()
    await sheet.getByLabel('수량').fill('10')
    await sheet.getByLabel('거래일').fill('2026-06-05')
    await sheet.getByLabel('단가').fill('25000')
    // 금액 자동 = 수량 × 단가 = 250,000원 (서버 amount 동형 미리보기)
    await expect(sheet.getByTestId('txn-amount')).toHaveText('250,000원')

    // 매입처(대한농협) 선택
    await sheet.getByRole('button', { name: '거래처 선택' }).click()
    const picker = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: '거래처 선택' }) })
    await picker.getByRole('button', { name: /대한농협/ }).click()
    await expect(
      page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '거래처 선택' }) }),
    ).toHaveCount(0)
    // 시트에 선택된 거래처 상호가 표시
    await expect(sheet.getByText('대한농협')).toBeVisible()

    // 저장은 POST 1회(낙관 — 재조회 없이 이력 반영)
    let postCount = 0
    page.on('request', (req) => {
      if (
        req.method() === 'POST' &&
        new URL(req.url()).pathname === '/api/inventory/transactions'
      )
        postCount++
    })

    await sheet.getByRole('button', { name: '거래 저장' }).click()
    await expect(txnSheet(page)).toHaveCount(0)

    // 거래가 이력 최상단에 즉시 나타나고 거래처 상호·금액이 표시
    await expect(history.getByText('2026-06-05')).toBeVisible()
    await expect(history.getByText('대한농협')).toBeVisible()
    await expect(history.getByText('250,000원')).toBeVisible()
    expect(postCount).toBe(1)
  })

  test('AC-18: 거래처를 선택하지 않고도 저장할 수 있고 이력에 거래처 미연결로 표시된다', async ({
    page,
  }) => {
    await bootWithMockedApi(page)
    await openProView(page, INVENTORY_LABEL)
    const view = page.getByTestId('inventory-view')
    await seedItem(page, '고추종자', '봉')
    await view.getByRole('button', { name: '고추종자 거래 이력' }).click()
    const history = page.getByTestId('transaction-history')

    // 거래처 미선택 입고 — 저장 가능(미연결 정상, 절충 2)
    await addTransaction(page, { type: 'in', quantity: 12, txnDate: '2026-06-07' })

    await expect(history.getByText('2026-06-07')).toBeVisible()
    // 거래처 미연결 표식 노출
    await expect(history.getByText('거래처 미연결')).toBeVisible()
  })
})
