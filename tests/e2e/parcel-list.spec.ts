import { expect, test, type Page } from '@playwright/test'
import { formatArea } from '../../src/utils/formatArea'
import {
  bootWithMockedApi,
  jibunOf,
  LIST_AREAS_M2,
  openMenuItem,
  PARCEL_COUNT,
  RED_PARCEL_ID,
} from './helpers/mockApi'

// 명세: docs/specs/parcel-list.md — AC-10·AC-11 (E2E 소관은 이 2건)
// AC-1~5·7~9는 tests/unit/list/, AC-6은 tests/integration/parcels.test.ts 소관.
// /api 모킹·부팅 대기는 helpers/mockApi.ts 공용 — GET /api/parcel-areas(면적 일괄)가 추가 모킹되어 있다.

/**
 * 목록 진입 (지도 우상단 임시 IconButton) — 면적 일괄 조회(GET /api/parcel-areas)가
 * 진입과 함께 1회 발생하는 것까지 확인한다 (AC-10 "일괄 API 경유"의 전제).
 */
async function openListView(page: Page) {
  const areasRequest = page.waitForRequest(
    (req) => req.method() === 'GET' && new URL(req.url()).pathname === '/api/parcel-areas',
  )
  await openMenuItem(page, '필지 목록')
  const list = page.getByTestId('parcel-list-view')
  await expect(list).toBeVisible()
  await areasRequest
  return list
}

test('AC-10: 목록 진입 시 카운트에 전체 필지 수가 표시되고 면적 컬럼에 일괄 API 경유 환산 값이 나타난다', async ({
  page,
}) => {
  await bootWithMockedApi(page)
  const list = await openListView(page)

  // 카운트 "{필터 후 행 수} / {전체 필지 수} 필지" — 초기 무검색·무필터라 양쪽 다 전체 (parcels.json 기준)
  const total = PARCEL_COUNT.toLocaleString('ko')
  await expect(list.getByTestId('list-count')).toHaveText(`${total} / ${total} 필지`)

  // 면적 픽스처가 있는 행은 '-'가 아닌 환산 값(초기 단위 ㎡, formatArea 동일 경로)으로 표시된다
  for (const [id, m2] of Object.entries(LIST_AREAS_M2)) {
    await expect(
      list.getByText(formatArea(m2, 'm2'), { exact: true }),
      `필지 ${id}의 환산 면적 표시`,
    ).toBeVisible()
  }
})

test('AC-11: 검색한 행을 탭하면 필지 시트가 목록 위에 열리고, 닫으면 검색 상태 목록이 남으며, 지도로 복귀한다', async ({
  page,
}) => {
  await bootWithMockedApi(page)
  const list = await openListView(page)

  // 검색어는 픽스처 필지의 실제 지번에서 도출 — parcels.json 변화에 견고 (하드코딩 회피)
  const jibun = jibunOf(RED_PARCEL_ID)
  expect(jibun, `픽스처 필지(${RED_PARCEL_ID})의 지번이 parcels.json에 없음`).not.toBeNull()
  if (jibun === null) throw new Error('unreachable')

  const search = list.getByRole('textbox', { name: '지번·그룹명 검색' })
  await search.fill(jibun)

  // includes 부분 일치 검색이라 다른 지번도 남을 수 있다 — 고유 면적 픽스처 값으로 대상 행을 특정
  const areaText = formatArea(LIST_AREAS_M2[RED_PARCEL_ID], 'm2')
  const row = list.getByRole('button').filter({ hasText: areaText })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(jibun)

  // 행 탭 = ui.tapParcel — 비소속 필지라 해당 id의 단건 조회와 함께 필지 시트가 열린다
  const infoRequest = page.waitForRequest(
    (req) =>
      req.method() === 'GET' &&
      new URL(req.url()).pathname === `/api/parcels/${encodeURIComponent(RED_PARCEL_ID)}`,
  )
  await row.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await infoRequest
  // 해당 지번의 시트인지 — 이름 미입력 시 지번이 이름 입력 placeholder (M-7 보존 동작)
  await expect(sheet.getByLabel('이름')).toHaveAttribute('placeholder', jibun)
  // 목록 위에 열림 — listViewOpen 유지 (v1 이슈 #5 수정본 보존)
  await expect(list).toBeVisible()

  // 시트 닫기(헤더 닫기 버튼 — backdrop 400ms 가드 비대상) → 검색 상태의 목록이 그대로 남는다
  await sheet.getByRole('button', { name: '닫기' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByTestId('sheet-backdrop')).toHaveCount(0)
  await expect(list).toBeVisible()
  await expect(search).toHaveValue(jibun)
  await expect(row).toBeVisible()

  // "지도로 돌아가기" → 목록 닫힘, 지도(캔버스) 복귀
  await list.getByRole('button', { name: '지도로 돌아가기' }).click()
  await expect(page.getByTestId('parcel-list-view')).toHaveCount(0)
  await expect(page.locator('canvas').first()).toBeVisible()
})
