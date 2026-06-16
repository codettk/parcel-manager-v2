import { expect, test, type Page } from '@playwright/test'
import {
  bootWithMockedApi,
  jibunOf,
  LAND_INFO_LNDCGR_NM,
  PNU_PARCEL_ID,
} from './helpers/mockApi'

// 명세: docs/specs/vworld-land-info.md — AC-9 (E2E 소관은 이 1건)
// AC-1~5는 핸들러·스크립트(tests/integration·unit), AC-6~8은 RTL(tests/unit/parcel) 소관.
// /api 모킹·부팅 대기는 helpers/mockApi.ts 공용 — PNU_PARCEL_ID만 GET 단건 조회에서
// pnu가 채워진 미조회(vworldFetchedAt null) 필지로 노출되고,
// POST /api/parcels/:id/fetch-land-info(성공 시 갱신 행 전체)가 추가 모킹되어 있다.

/**
 * 목록 진입(지도 우상단 임시 IconButton) → 지번 검색 → 대상 행 탭으로 필지 시트를 연다.
 * 지도 탭은 픽셀 스캔이라 대상 필지를 특정할 수 없어, 결정적인 목록 경로로 PNU_PARCEL_ID를 연다
 * (openParcelFromList → 시트 직행). 행 탭이 PNU_PARCEL_ID의 단건 조회를 내는 것으로 대상을 확정한다.
 */
async function openPnuParcelSheet(page: Page) {
  const jibun = jibunOf(PNU_PARCEL_ID)
  expect(jibun, `픽스처 필지(${PNU_PARCEL_ID})의 지번이 parcels.json에 없음`).not.toBeNull()
  if (jibun === null) throw new Error('unreachable')

  await page.getByRole('button', { name: '필지 목록' }).click()
  const list = page.getByTestId('parcel-list-view')
  await expect(list).toBeVisible()

  await list.getByRole('textbox', { name: '지번·그룹명 검색' }).fill(jibun)

  // 부분 일치라 동일 지번 행이 여럿일 수 있다 — 행 탭이 PNU_PARCEL_ID의 단건 조회를 내는지로 대상 확정.
  const pnuGetPath = `/api/parcels/${encodeURIComponent(PNU_PARCEL_ID)}`
  const rows = list.getByRole('button').filter({ hasText: jibun })
  await expect(rows.first()).toBeVisible()
  const count = await rows.count()
  for (let i = 0; i < count; i++) {
    const infoRequest = page.waitForRequest(
      (req) => req.method() === 'GET' && new URL(req.url()).pathname === pnuGetPath,
      { timeout: 2_000 },
    )
    await rows.nth(i).click()
    const sheet = page.getByRole('dialog')
    if (await sheet.isVisible().catch(() => false)) {
      const matched = await infoRequest.then(
        () => true,
        () => false,
      )
      if (matched) return sheet
      // 다른 필지 시트가 열렸다 — 닫고 다음 행 시도
      await sheet.getByRole('button', { name: '닫기' }).click()
      await expect(sheet).toBeHidden()
    } else {
      await infoRequest.catch(() => undefined)
    }
  }
  throw new Error(`검색 결과에서 PNU_PARCEL_ID(${PNU_PARCEL_ID}) 행을 열지 못함`)
}

test('AC-9: pnu 있는 미조회 필지 시트에서 "토지임야 조회"를 탭하면 버튼이 사라지고 카드에 지목이 표시된다', async ({
  page,
}) => {
  await bootWithMockedApi(page)
  const sheet = await openPnuParcelSheet(page)

  // 미조회(vworldFetchedAt null) + pnu 있음 → 카드 대신 "토지임야 조회" 버튼이 보인다.
  const fetchButton = sheet.getByRole('button', { name: '토지임야 조회' })
  await expect(fetchButton).toBeVisible()
  await expect(fetchButton).toBeEnabled()
  // 조회 전에는 지목이 표시되지 않는다 (카드 부재)
  await expect(sheet.getByText('지목', { exact: true })).toHaveCount(0)

  // 버튼 탭 → fetch-land-info 1회 POST.
  const fetchRequest = page.waitForRequest(
    (req) =>
      req.method() === 'POST' &&
      new URL(req.url()).pathname ===
        `/api/parcels/${encodeURIComponent(PNU_PARCEL_ID)}/fetch-land-info`,
  )
  await fetchButton.click()
  await fetchRequest

  // 성공 응답으로 버튼이 사라지고 토지 정보 카드에 지목이 표시된다 (poll 자동 재시도).
  await expect(sheet.getByRole('button', { name: '토지임야 조회' })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: '조회 중…' })).toHaveCount(0)
  await expect(sheet.getByText('지목', { exact: true })).toBeVisible()
  await expect(sheet.getByText(LAND_INFO_LNDCGR_NM, { exact: true })).toBeVisible()
})
