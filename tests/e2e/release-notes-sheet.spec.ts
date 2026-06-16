import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { mockApi, openMenuItem } from './helpers/mockApi'

// 명세: docs/specs/release-notes-sheet.md — AC-1~AC-4 (AC-5는 단위 테스트 소관)
// 기대값은 실제 데이터 소스(RELEASE_NOTES.md)에서 파생 — 파일 갱신 시 테스트가 자동 추종
// 시트는 부팅과 무관하지만 /api 모킹을 적용해 webServer(vite 단독)의 부팅 502 노이즈를 제거한다

const notesPath = fileURLToPath(new URL('../../RELEASE_NOTES.md', import.meta.url))
const notesRaw = readFileSync(notesPath, 'utf-8')
const lines = notesRaw.split('\n').map((l) => l.trimEnd())

const versions = lines.filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim())
const groupHeadings = lines.filter((l) => l.startsWith('### ')).map((l) => l.slice(4).trim())
const items = lines
  .filter((l) => l.startsWith('- '))
  .map((l) => l.slice(2).trim().replaceAll('**', ''))
const strongTexts = [...notesRaw.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1])

async function openSheet(page: Page) {
  await mockApi(page)
  await page.goto('/')
  await openMenuItem(page, '릴리즈 노트')
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  return sheet
}

test('AC-1: 우상단 릴리즈 노트 버튼을 탭하면 시트가 열리고 제목 "릴리즈 노트"가 표시된다', async ({
  page,
}) => {
  const sheet = await openSheet(page)
  await expect(sheet.getByRole('heading', { name: '릴리즈 노트', exact: true })).toBeVisible()
})

test('AC-2: 모든 버전 섹션이 파일 기재 순서대로 표시되고 그룹 헤딩·불릿 항목이 모두 렌더된다', async ({
  page,
}) => {
  const sheet = await openSheet(page)

  // 버전 섹션: 개수 + 파일 기재 순서 일치
  expect(versions.length).toBeGreaterThan(0)
  await expect(sheet.getByRole('heading', { level: 3 })).toHaveText(versions)

  // 그룹 헤딩 전부 렌더
  for (const heading of groupHeadings) {
    await expect(sheet.getByRole('heading', { name: heading }).first()).toBeVisible()
  }

  // 불릿 항목 텍스트 전부 렌더 (강조 마커 제거한 평문 기준)
  for (const item of items) {
    await expect(sheet.getByRole('listitem').filter({ hasText: item }).first()).toBeVisible()
  }
})

test('AC-3: `**강조**` 마커는 화면에 노출되지 않고 <strong> 요소로 렌더된다', async ({ page }) => {
  expect(strongTexts.length).toBeGreaterThan(0) // 데이터 소스에 강조 항목이 있어야 검증 가능
  const sheet = await openSheet(page)

  // `**` 마커 미노출
  expect(await sheet.innerText()).not.toContain('**')

  // 강조 텍스트가 <strong> 요소로 렌더
  for (const text of strongTexts) {
    await expect(sheet.locator('strong').filter({ hasText: text }).first()).toBeVisible()
  }
})

test('AC-4: 닫기 버튼을 탭하면 시트가 닫히고 릴리즈 노트 버튼이 다시 조작 가능하다', async ({
  page,
}) => {
  const sheet = await openSheet(page)

  await sheet.getByRole('button', { name: '닫기' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByTestId('sheet-backdrop')).toHaveCount(0)

  // 지도 화면 복귀 + 진입점 재조작 가능 (재오픈으로 검증).
  // 진입점은 NavDrawer로 이관 — 메뉴 버튼이 조작 가능하고, 메뉴 경유 재오픈으로 시트가 다시 뜬다
  const menuButton = page.getByRole('button', { name: '메뉴' })
  await expect(menuButton).toBeEnabled()
  await openMenuItem(page, '릴리즈 노트')
  await expect(page.getByRole('dialog')).toBeVisible()
})
