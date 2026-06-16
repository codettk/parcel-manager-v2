import { expect, test, type Page } from '@playwright/test'
import { bootWithMockedApi, DAP_PARCEL_ID, DAP_PARCEL_JIBUN, openMenuItem } from './helpers/mockApi'

// 명세: docs/specs/jimok-filter.md — AC-8·AC-9 (E2E 소관은 이 2건)
// AC-1~3은 tests/unit/jimokFilter.test.ts(순수 함수), AC-4~7은 tests/unit/JimokFilter.test.tsx
// + MapCanvas 단위 소관. /api 모킹·부팅 대기는 helpers/mockApi.ts 공용.
//
// 지목 칩 바(features/map/JimokFilter.tsx)는 App에서 !listViewOpen일 때 지도 위 상단
// (absolute top-28 left-3 right-3, 가로 스크롤 — 아이콘 스택 아래 행)에 상시 렌더된다.
// 칩은 공통 Chip(aria-pressed로 선택 표현),
// '대지'는 ALL_JIMOK '대'의 라벨(JIMOK_LABELS), 초기 6종 전체 선택이라 모두 aria-pressed=true.

/** 지목 칩 바 — '대지' 칩(JIMOK_LABELS['대']) 로케이터 */
function daejiChip(page: Page) {
  return page.getByRole('button', { name: '대지', exact: true })
}

test('AC-8: 지도 위 지목 칩 바에서 "대지" 칩을 탭해 해제하면 화면이 유지되고 비선택(aria-pressed=false)으로 바뀐다', async ({
  page,
}) => {
  await bootWithMockedApi(page)

  // 초기 6종 전체 선택 — '대지' 칩이 보이고 선택 상태(aria-pressed=true)
  const daeji = daejiChip(page)
  await expect(daeji).toBeVisible()
  await expect(daeji).toHaveAttribute('aria-pressed', 'true')

  // 실제 사용자 탭(좌표 기반 click) — 칩이 다른 요소에 가려지지 않고 탭 가능해야 한다.
  await daeji.click({ timeout: 5_000 })

  // 탭 해제 → '대지' 칩만 비선택 표시로 바뀐다 (poll 자동 재시도)
  await expect(daeji).toHaveAttribute('aria-pressed', 'false')

  // 화면 정상 유지 — 지도 캔버스가 그대로 보이고, 칩 바도 계속 렌더된다 (크래시·소멸 없음)
  await expect(page.locator('canvas').first()).toBeVisible()
  await expect(daeji).toBeVisible()
})

// AC-9는 "시트가 열려 있는 상태에서 필터를 변경"이 관찰 포인트다.
// 모바일 BottomSheet는 전면 backdrop(z-40)이 칩 바(z-10)를 덮어 시트 연 채 칩을 탭할 수 없다.
// 와이드 SidePanel은 비모달(backdrop 없음 — 시트 연 채 지도·칩 바 조작이 실경로, v1 와이드 보존)이라
// 이 시나리오의 실제 경로다. 따라서 AC-9는 와이드 뷰포트에서 검증한다.
test.describe('AC-9 (와이드): 필터 변경 시 열린 시트가 닫히고 선택이 해제된다', () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test('AC-9: "답" 필지 시트가 열린 상태에서 지목 필터를 변경하면 시트가 닫히고 선택이 해제된다', async ({
    page,
  }) => {
    await bootWithMockedApi(page)

    // 결정적으로 '답' 분류 필지 시트를 연다 — 목록 검색 경로(openParcelFromList → 시트 직행).
    // 지도 탭은 픽셀 스캔이라 특정 분류 필지를 지정할 수 없어 목록 경로를 쓴다.
    await openMenuItem(page, '필지 목록')
    const list = page.getByTestId('parcel-list-view')
    await expect(list).toBeVisible()

    await list.getByRole('textbox', { name: '지번·그룹명 검색' }).fill(DAP_PARCEL_JIBUN)

    // DAP_PARCEL_JIBUN은 부분일치 검색 유일 지번(mockApi 도출) — 행 1개, 그 행 탭이 DAP 단건 조회를 낸다
    const row = list.getByRole('button').filter({ hasText: DAP_PARCEL_JIBUN })
    await expect(row).toHaveCount(1)
    const infoRequest = page.waitForRequest(
      (req) =>
        req.method() === 'GET' &&
        new URL(req.url()).pathname === `/api/parcels/${encodeURIComponent(DAP_PARCEL_ID)}`,
    )
    await row.click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await infoRequest

    // 목록을 닫아 지도 복귀 — 칩 바는 !listViewOpen일 때만 렌더되므로 필터를 바꾸려면 목록을 닫아야 한다.
    // closeListView는 listViewOpen만 끄고 시트·선택은 보존한다 → 시트가 열린 채 지도로 돌아간다.
    await list.getByRole('button', { name: '지도로 돌아가기' }).click()
    await expect(page.getByTestId('parcel-list-view')).toHaveCount(0)

    // 시트는 여전히 열려 있고(선택 유지), 칩 바가 지도 위에 보인다 (와이드 SidePanel 비모달).
    await expect(sheet).toBeVisible()
    const daeji = daejiChip(page)
    await expect(daeji).toBeVisible()
    await expect(daeji).toHaveAttribute('aria-pressed', 'true')

    // 필터 변경(칩 토글) → 선택·시트 해제 (v1 useEffect 보존). '대지' 토글로 필터를 바꾼다.
    await daeji.click()

    // 열린 시트가 닫히고 선택이 해제된다 — 시트 DOM 소멸로 단언.
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // 필터 자체는 정상 변경됨(부수 검증) — '대지'가 비선택으로 바뀌고 화면은 유지된다.
    await expect(daeji).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('canvas').first()).toBeVisible()
  })
})
