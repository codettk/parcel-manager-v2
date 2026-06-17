import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { shareFileSchema } from '../../../src/features/share/shareFile'
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
} from '../helpers/mockApi'
import { findClickPoint } from '../helpers/pixels'

// 핵심 여정 ⑤ — JSON 내보내기 → 불러오기 라운드트립 (하나의 흐름으로)
//   색칠/그룹 상태 → 내보내기(실 다운로드 파일) → 상태 초기화(색 제거) →
//   같은 파일 불러오기(실 file input) → 원상복구(캔버스 픽셀·필지 시트).
// 모킹 페이로드가 아니라 실제 다운로드된 파일을 그대로 다시 올려 내보내기·불러오기 양 경로를 통과.

const RED_FILL = compositedFill(PARCEL_HEX)
const BLUE_FILL = compositedFill(GROUP_HEX)

const PARCEL_GET_RE = /^\/api\/parcels\/[^/]+$/
function isParcelGet(req: { method(): string; url(): string }): boolean {
  return req.method() === 'GET' && PARCEL_GET_RE.test(new URL(req.url()).pathname)
}

/** 빨강 합성 채움(override 필지) 지점을 탭해 시트를 연다 — 단건 조회 id로 RED_PARCEL_ID 확인 */
async function tapRedParcel(page: Page) {
  const point = await findClickPoint(page, RED_FILL, 2, 0.7, COMPOSITE_TOLERANCE)
  expect(point, '빨강 합성 채움 영역 없음').not.toBeNull()
  if (!point) throw new Error('unreachable')
  const infoRequest = page.waitForRequest(isParcelGet)
  await page.mouse.click(point.x, point.y)
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  const segments = new URL((await infoRequest).url()).pathname.split('/')
  expect(decodeURIComponent(segments[segments.length - 1])).toBe(RED_PARCEL_ID)
  return sheet
}

async function saveParcelSheet(page: Page, sheet: ReturnType<Page['getByRole']>) {
  const upsertPath = `/api/tabs/${TAB_ID}/parcels/${encodeURIComponent(RED_PARCEL_ID)}`
  const upsertRequest = page.waitForRequest(
    (req) => req.method() === 'POST' && new URL(req.url()).pathname === upsertPath,
  )
  await sheet.getByRole('button', { name: '저장' }).click()
  await upsertRequest
  await expect(sheet).toBeHidden()
}

test('⑤ 색칠/그룹 상태 → JSON 내보내기 → 색 제거 → 같은 파일 불러오기 → 원상복구', async ({
  page,
}, testInfo) => {
  await bootWithMockedApi(page)

  // 사전 조건: 빨강 필지 + 파랑 그룹 합성 픽셀이 모두 렌더
  expect(await countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE)).toBeGreaterThan(0)
  expect(await countNearPixels(page, BLUE_FILL, COMPOSITE_TOLERANCE)).toBeGreaterThan(0)

  // ── 내보내기: 실 다운로드 파일 캡처 + version 2 포맷 검증
  await openMenuItem(page, '공유')
  const shareSheet = page.getByRole('dialog')
  await expect(shareSheet.getByText('공유 — JSON 파일로 동기화')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await shareSheet.getByRole('button', { name: 'JSON 내보내기' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^필지_기본_\d{4}-\d{2}-\d{2}\.json$/)
  const exportedPath = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(exportedPath)

  const exported = shareFileSchema.parse(JSON.parse(readFileSync(exportedPath, 'utf-8')))
  expect(exported.version).toBe(2)
  expect(exported.overrides[RED_PARCEL_ID]).toMatchObject({ color: 'c-red' })
  expect(Object.keys(exported.groups)).toHaveLength(1)

  await shareSheet.getByRole('button', { name: '닫기' }).click()
  await expect(shareSheet).toBeHidden()

  // ── 상태 초기화: 빨강 필지의 색 제거 → override 소멸 → 빨강 합성 픽셀 0
  {
    const sheet = await tapRedParcel(page)
    await sheet.getByRole('button', { name: '없음' }).click()
    await saveParcelSheet(page, sheet)
  }
  await expect
    .poll(() => countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBe(0)

  // ── 불러오기: 내보낸 실파일 선택 → 미리보기 → 적용
  await openMenuItem(page, '공유')
  await expect(shareSheet.getByText('공유 — JSON 파일로 동기화')).toBeVisible()
  const chooserPromise = page.waitForEvent('filechooser')
  await shareSheet.getByRole('button', { name: 'JSON 불러오기' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(exportedPath)

  await expect(shareSheet.getByText('공유 — 불러오기 확인')).toBeVisible()
  await expect(shareSheet.getByText('필지 1개')).toBeVisible()
  await expect(shareSheet.getByText('그룹 1개')).toBeVisible()

  const importRequest = page.waitForRequest(
    (req) => req.method() === 'PUT' && new URL(req.url()).pathname === `/api/tabs/${TAB_ID}/import`,
  )
  await shareSheet.getByRole('button', { name: '적용' }).click()
  await importRequest
  await expect(
    shareSheet.getByText('불러오기를 적용했습니다 — 현재 탭에 반영되었습니다.'),
  ).toBeVisible()
  await shareSheet.getByRole('button', { name: '닫기' }).click()
  await expect(shareSheet).toBeHidden()

  // ── 원상복구: 빨강·파랑 합성 픽셀 재출현 (재조회 → 재렌더)
  await expect
    .poll(() => countNearPixels(page, RED_FILL, COMPOSITE_TOLERANCE), { timeout: 10_000 })
    .toBeGreaterThan(0)
  expect(await countNearPixels(page, BLUE_FILL, COMPOSITE_TOLERANCE)).toBeGreaterThan(0)

  // 필지 시트로도 복원 확인 — 빨강 선택 상태로 복귀
  {
    const sheet = await tapRedParcel(page)
    await expect(sheet.getByRole('button', { name: '빨강' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  }
})
