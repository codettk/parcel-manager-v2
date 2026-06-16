import { expect, test, type Page } from '@playwright/test'
import { formatArea } from '../../../src/utils/formatArea'
import {
  bootWithMockedApi,
  GROUP_MEMBER_IDS,
  jibunOf,
  LIST_AREAS_M2,
  openMenuItem,
  PARCEL_COUNT,
  RED_PARCEL_ID,
} from '../helpers/mockApi'

// 핵심 여정 ④ — 목록 뷰 검색·정렬 (하나의 흐름으로)
//   목록 진입(전체 카운트·일괄 면적 API) → 지번 검색(필터링) → 검색 초기화 →
//   면적순 정렬 전환(면적 큰 행이 작은 행보다 위) → 행 탭으로 필지 시트 → 지도 복귀.
// mockApi: GET /api/parcel-areas 일괄 면적 픽스처(RED_PARCEL_ID=2345.6, GROUP_MEMBER_IDS[0]=678.9).

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

/** 목록 본문에서 면적 텍스트로 행을 특정 (고유 픽스처 면적은 부분일치 회피) */
function rowByArea(list: ReturnType<Page['getByTestId']>, m2: number) {
  return list.getByRole('button').filter({ hasText: formatArea(m2, 'm2') })
}

test('④ 목록 진입 → 지번 검색 → 초기화 → 면적순 정렬 → 행 탭 시트 → 지도 복귀', async ({
  page,
}) => {
  await bootWithMockedApi(page)
  const list = await openListView(page)

  // 진입: 카운트에 전체 필지 수(필터 전이라 양쪽 동일)
  const total = PARCEL_COUNT.toLocaleString('ko')
  await expect(list.getByTestId('list-count')).toHaveText(`${total} / ${total} 필지`)

  // ── 검색: RED_PARCEL_ID 지번으로 필터 → 카운트가 줄고 그 지번 행만 남는 부분집합.
  // (비가상화 목록 4,409행 — 검색으로 행 수를 좁힌 뒤 면적 행을 특정해 풀스캔 비용을 줄인다)
  const jibun = jibunOf(RED_PARCEL_ID)
  expect(jibun, `픽스처 필지(${RED_PARCEL_ID}) 지번이 parcels.json에 없음`).not.toBeNull()
  if (jibun === null) throw new Error('unreachable')

  const bigArea = LIST_AREAS_M2[RED_PARCEL_ID] // 2345.6
  const smallArea = LIST_AREAS_M2[GROUP_MEMBER_IDS[0]] // 678.9

  const search = list.getByRole('textbox', { name: '지번·그룹명 검색' })
  await search.fill(jibun)
  // 부분일치라 다른 지번도 남을 수 있으나, 고유 면적(2345.6) 행은 검색 후에도 정확히 1개 존재
  await expect(rowByArea(list, bigArea)).toHaveCount(1)
  await expect(rowByArea(list, bigArea)).toContainText(jibun)
  // 검색으로 행 수가 전체보다 줄었다 (카운트 "{N} / {전체}"에서 N < 전체)
  await expect(list.getByTestId('list-count')).not.toHaveText(`${total} / ${total} 필지`)

  // ── 검색 초기화 → 전체 카운트 복귀
  await list.getByRole('button', { name: '검색어 지우기' }).click()
  await expect(search).toHaveValue('')
  await expect(list.getByTestId('list-count')).toHaveText(`${total} / ${total} 필지`)

  // ── 정렬: '면적' 전환 → 면적 내림차순. 큰 면적(2345.6) 행이 작은 면적(678.9) 행보다 위.
  await list.getByRole('button', { name: '면적', exact: true }).click()
  await expect(list.getByRole('button', { name: '면적', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // 두 픽스처 면적 행의 DOM y 좌표로 순서 검증 — 큰 면적이 작은 면적보다 위
  const bigBox = await rowByArea(list, bigArea).boundingBox()
  const smallBox = await rowByArea(list, smallArea).boundingBox()
  expect(bigBox, '큰 면적 행 박스 없음').not.toBeNull()
  expect(smallBox, '작은 면적 행 박스 없음').not.toBeNull()
  if (!bigBox || !smallBox) throw new Error('unreachable')
  expect(bigBox.y).toBeLessThan(smallBox.y) // 내림차순 — 큰 면적이 위

  // ── 행 탭 → 필지 시트. 비가상화 4,409행에서 role 질의는 O(n)이라
  // 다시 검색해 목록을 좁힌 뒤 탭한다(parcel-list.spec 패턴 — 풀스캔 접근성 트리 회피).
  await search.fill(jibun)
  await expect(rowByArea(list, bigArea)).toHaveCount(1)
  const infoRequest = page.waitForRequest(
    (req) =>
      req.method() === 'GET' &&
      new URL(req.url()).pathname === `/api/parcels/${encodeURIComponent(RED_PARCEL_ID)}`,
  )
  await rowByArea(list, bigArea).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await infoRequest
  await expect(sheet.getByLabel('이름')).toHaveAttribute('placeholder', jibun)
  await expect(list).toBeVisible() // 목록 위에 열림

  // ── 시트 닫기 → 검색 상태 목록 유지 → 지도로 복귀
  await sheet.getByRole('button', { name: '닫기' }).click()
  await expect(sheet).toBeHidden()
  await expect(search).toHaveValue(jibun)
  await list.getByRole('button', { name: '지도로 돌아가기' }).click()
  await expect(page.getByTestId('parcel-list-view')).toHaveCount(0)
  await expect(page.locator('canvas').first()).toBeVisible()
})
