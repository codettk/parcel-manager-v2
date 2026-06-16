import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HistorySheet } from '../../../src/features/tab/HistorySheet'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { HistoryItem } from '../../../src/types/api/history'

// 명세: docs/specs/tab-workspace.md — AC-6(목록 내림차순)·AC-7(복원→닫힘)·AC-8(삭제 2단계)
const loadHistory = vi.fn(async () => {})
const restoreHistory = vi.fn(async () => {})
const renameHistory = vi.fn()
const deleteHistory = vi.fn()

// jsdom에는 matchMedia가 없으므로 스텁 (Sheet → useIsWide). false = BottomSheet 경로
function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

function makeHistory(tabId: string, name: string, closedAt: string): HistoryItem {
  return {
    tabId,
    name,
    sortOrder: 0,
    closedAt,
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedBy: null,
    updatedAt: '2026-06-16T00:00:00.000Z',
  }
}

function seedHistory(items: HistoryItem[]) {
  useWorkspaceStore.setState({
    history: items,
    loadHistory,
    restoreHistory,
    renameHistory,
    deleteHistory,
  })
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  stubMatchMedia()
  useUiStore.getState().openHistory()
})

describe('AC-6: 히스토리 목록 표시', () => {
  it('두 항목이 닫은 시각 내림차순으로 이름과 함께 표시된다', () => {
    seedHistory([
      makeHistory('tab_old', '오래된 작업', '2026-06-14T10:00:00.000Z'),
      makeHistory('tab_new', '최근 작업', '2026-06-15T10:00:00.000Z'),
    ])
    render(<HistorySheet />)

    expect(loadHistory).toHaveBeenCalledTimes(1)
    const names = screen.getAllByText(/작업$/).map((el) => el.textContent)
    // 내림차순 — 최근(06-15)이 먼저
    expect(names).toEqual(['최근 작업', '오래된 작업'])
  })

  it('빈 목록이면 EmptyState를 표시한다', () => {
    seedHistory([])
    render(<HistorySheet />)
    expect(screen.getByText('닫힌 작업공간이 없습니다.')).toBeInTheDocument()
  })
})

describe('AC-7: 복원 → restore 호출 + 시트 닫힘', () => {
  it('복원 버튼 → restoreHistory(tabId) + closeHistory', async () => {
    seedHistory([makeHistory('tab_h1', '복원 대상', '2026-06-15T10:00:00.000Z')])
    render(<HistorySheet />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /복원/ }))

    expect(restoreHistory).toHaveBeenCalledExactlyOnceWith('tab_h1')
    expect(useUiStore.getState().historyOpen).toBe(false)
  })
})

describe('AC-8: 삭제 ConfirmInline 2단계', () => {
  it('확인 전에는 deleteHistory 미호출, 확인 후 호출', async () => {
    seedHistory([makeHistory('tab_h1', '삭제 대상', '2026-06-15T10:00:00.000Z')])
    render(<HistorySheet />)
    const user = userEvent.setup()

    // 1단계: 삭제 버튼 (armed 진입)
    await user.click(screen.getByRole('button', { name: '삭제' }))
    expect(deleteHistory).not.toHaveBeenCalled()

    // 2단계: 영구 삭제 확인
    await user.click(screen.getByRole('button', { name: '영구 삭제' }))
    expect(deleteHistory).toHaveBeenCalledExactlyOnceWith('tab_h1')
  })
})

describe('인라인 이름 변경', () => {
  it('이름 변경 버튼 → input Enter → renameHistory 호출', async () => {
    seedHistory([makeHistory('tab_h1', '원래 이름', '2026-06-15T10:00:00.000Z')])
    render(<HistorySheet />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /이름 변경/ }))
    const input = screen.getByLabelText('작업공간 이름 편집')
    await user.clear(input)
    await user.type(input, '바뀐 이름{Enter}')

    expect(renameHistory).toHaveBeenCalledWith('tab_h1', '바뀐 이름')
  })

  it('Escape는 renameHistory를 호출하지 않는다', async () => {
    seedHistory([makeHistory('tab_h1', '원래 이름', '2026-06-15T10:00:00.000Z')])
    render(<HistorySheet />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /이름 변경/ }))
    const input = screen.getByLabelText('작업공간 이름 편집')
    await user.type(input, '바뀐{Escape}')

    expect(renameHistory).not.toHaveBeenCalled()
  })
})
