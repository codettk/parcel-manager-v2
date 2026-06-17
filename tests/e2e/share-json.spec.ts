import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import { shareFileSchema } from '../../src/features/share/shareFile'
import {
  bootWithMockedApi,
  compositedFill,
  COMPOSITE_TOLERANCE,
  countNearPixels,
  GROUP_HEX,
  openMenuItem,
  PARCEL_HEX,
  RED_PARCEL_ID,
  TAB_ID,
} from './helpers/mockApi'
import { findClickPoint } from './helpers/pixels'

// 명세: docs/specs/share-json.md — AC-7 (Playwright 소관은 이 1건)
// AC-1~3은 tests/unit/share/shareFile 단위, AC-4~6은 RTL(ShareSheet) 소관.
// 왕복 검증은 모킹 페이로드가 아니라 "실제 다운로드된 파일"을 그대로 다시 올리는 구성 —
// 내보내기(Blob anchor 다운로드)와 불러오기(file input)의 실경로를 모두 통과시킨다.
// mockApi의 PUT /api/tabs/:tabId/import는 서버의 group_id 전부 재생성을 모사하므로
// 적용 후 재조회(importFromFile ③)가 서버 동형으로 검증된다.

const EXPORT_NAME = 'E2E 내보내기 이름'

const PARCEL_GET_RE = /^\/api\/parcels\/[^/]+$/

function isParcelGet(req: Request): boolean {
  return req.method() === 'GET' && PARCEL_GET_RE.test(new URL(req.url()).pathname)
}

function parcelIdOf(req: Request): string {
  const segments = new URL(req.url()).pathname.split('/')
  return decodeURIComponent(segments[segments.length - 1])
}

/**
 * 빨강 합성 채움(override 필지 = RED_PARCEL_ID) 지점을 탭해 필지 시트를 연다.
 * 단건 조회 요청의 id로 의도한 필지에 닿았음을 단언한다 (parcel-sheet.spec 패턴).
 */
async function tapRedParcel(page: Page) {
  const point = await findClickPoint(page, compositedFill(PARCEL_HEX), 2, 0.7, COMPOSITE_TOLERANCE)
  expect(point, '빨강 합성 채움(override 필지) 영역을 찾지 못함').not.toBeNull()
  if (!point) throw new Error('unreachable')

  const infoRequest = page.waitForRequest(isParcelGet)
  await page.mouse.click(point.x, point.y)
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  expect(parcelIdOf(await infoRequest)).toBe(RED_PARCEL_ID)
  return { point, sheet }
}

/** 필지 시트 저장 — upsert POST 완료까지 대기 후 시트 닫힘을 확인한다 */
async function saveParcelSheet(page: Page, sheet: Locator) {
  const upsertPath = `/api/tabs/${TAB_ID}/parcels/${encodeURIComponent(RED_PARCEL_ID)}`
  const upsertRequest = page.waitForRequest(
    (req) => req.method() === 'POST' && new URL(req.url()).pathname === upsertPath,
  )
  await sheet.getByRole('button', { name: '저장' }).click()
  await upsertRequest
  await expect(sheet).toBeHidden()
}

test('AC-7: 내보내기 → 상태 변경 → 같은 파일 불러오기 적용 — 캔버스 픽셀·필지 시트로 동일 상태 복원', async ({
  page,
}, testInfo) => {
  await bootWithMockedApi(page)
  const redFill = compositedFill(PARCEL_HEX)
  const blueFill = compositedFill(GROUP_HEX)

  // 사전 조건: override 필지(빨강)·그룹(파랑) 합성 픽셀이 모두 렌더된 앱
  expect(await countNearPixels(page, redFill, COMPOSITE_TOLERANCE)).toBeGreaterThan(0)
  expect(await countNearPixels(page, blueFill, COMPOSITE_TOLERANCE)).toBeGreaterThan(0)

  // 내보내기 시점 상태를 풍부하게: 빨강 필지에 이름 저장 (색은 c-red 유지)
  {
    const { sheet } = await tapRedParcel(page)
    await expect(sheet.getByRole('button', { name: '빨강' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await sheet.getByLabel('이름').fill(EXPORT_NAME)
    await saveParcelSheet(page, sheet)
  }

  // ① 내보내기 — 실제 다운로드 파일 캡처 + 포맷 검증 (version 2)
  await openMenuItem(page, '공유')
  const shareSheet = page.getByRole('dialog')
  await expect(shareSheet.getByText('공유 — JSON 파일로 동기화')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await shareSheet.getByRole('button', { name: 'JSON 내보내기' }).click()
  const download = await downloadPromise
  // 파일명: 필지_{탭이름="기본"}_{YYYY-MM-DD}.json
  expect(download.suggestedFilename()).toMatch(/^필지_기본_\d{4}-\d{2}-\d{2}\.json$/)

  const exportedPath = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(exportedPath)
  const exported = shareFileSchema.parse(JSON.parse(readFileSync(exportedPath, 'utf-8')))
  expect(exported.version).toBe(2)
  expect(exported.tabId).toBe(TAB_ID)
  expect(exported.overrides[RED_PARCEL_ID]).toMatchObject({ color: 'c-red', name: EXPORT_NAME })
  expect(Object.keys(exported.groups)).toHaveLength(1)
  expect(exported.colors).toHaveLength(2)

  await shareSheet.getByRole('button', { name: '닫기' }).click()
  await expect(shareSheet).toBeHidden()

  // ② 상태 차이 생성 — 빨강 필지의 색·이름 제거 → override 소멸 → 빨강 합성 픽셀 0
  {
    const { sheet } = await tapRedParcel(page)
    await sheet.getByRole('button', { name: '없음' }).click()
    await sheet.getByLabel('이름').fill('')
    await saveParcelSheet(page, sheet)
  }
  await expect
    .poll(() => countNearPixels(page, redFill, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBe(0)

  // ③ 불러오기 — 내보낸 실파일 선택 → 미리보기 확인 → 적용
  await openMenuItem(page, '공유')
  await expect(shareSheet.getByText('공유 — JSON 파일로 동기화')).toBeVisible()

  const chooserPromise = page.waitForEvent('filechooser')
  await shareSheet.getByRole('button', { name: 'JSON 불러오기' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(exportedPath)

  // 미리보기: 파일 규모 요약 + 전체 교체 경고
  await expect(shareSheet.getByText('공유 — 불러오기 확인')).toBeVisible()
  await expect(shareSheet.getByText('필지 1개')).toBeVisible()
  await expect(shareSheet.getByText('그룹 1개')).toBeVisible()
  // exact — 경고 문구("팔레트 색 2개는 …")와의 부분 일치 중복을 배제한다
  await expect(shareSheet.getByText('색 2개', { exact: true })).toBeVisible()
  await expect(shareSheet.getByText(/현재 탭의 필지 설정과 그룹이 모두 교체되고/)).toBeVisible()

  const importRequest = page.waitForRequest(
    (req) => req.method() === 'PUT' && new URL(req.url()).pathname === `/api/tabs/${TAB_ID}/import`,
  )
  await shareSheet.getByRole('button', { name: '적용' }).click()
  const importBody = (await importRequest).postDataJSON() as Record<string, unknown>
  const sentOverrides = importBody.overrides as Record<string, Record<string, unknown>>
  expect(sentOverrides[RED_PARCEL_ID]).toMatchObject({ color: 'c-red', name: EXPORT_NAME })
  expect(typeof importBody.clientId).toBe('string')
  await expect(
    shareSheet.getByText('불러오기를 적용했습니다 — 현재 탭에 반영되었습니다.'),
  ).toBeVisible()
  await shareSheet.getByRole('button', { name: '닫기' }).click()
  await expect(shareSheet).toBeHidden()

  // ④ 복원 검증 1 — 캔버스에 원래 색 합성 픽셀 재출현 (재조회 → 재렌더의 가시 신호)
  await expect
    .poll(() => countNearPixels(page, redFill, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBeGreaterThan(0)
  // 그룹도 재생성된 키(g-imported-*)로 재조회되어 파랑 합성 렌더가 유지된다
  expect(await countNearPixels(page, blueFill, COMPOSITE_TOLERANCE)).toBeGreaterThan(0)

  // ④ 복원 검증 2 — 필지 시트의 색 선택·이름이 내보내기 시점과 동일
  {
    const { sheet } = await tapRedParcel(page)
    await expect(sheet.getByRole('button', { name: '빨강' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(sheet.getByRole('button', { name: '없음' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(sheet.getByLabel('이름')).toHaveValue(EXPORT_NAME)
  }
})
