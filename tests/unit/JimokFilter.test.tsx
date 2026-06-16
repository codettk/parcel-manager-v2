import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JimokFilter } from '../../src/features/map/JimokFilter'
import { ALL_JIMOK } from '../../src/features/map/jimok'
import { useUiStore } from '../../src/stores/ui'
import { useWorkspaceStore } from '../../src/stores/workspace'

// 명세: docs/specs/jimok-filter.md — AC-4(초기 전체 aria-pressed)·AC-5(개별 해제→전체 해제)
// ·AC-6(전체 토글 isAll)·AC-7(빈 상태 7칩 false·크래시 없음). AC-8/9는 E2E(tester) 소관.

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
})

function pressedState() {
  return screen.getAllByRole('button').map((b) => ({
    name: b.textContent,
    pressed: b.getAttribute('aria-pressed'),
  }))
}

describe('JimokFilter 칩 바', () => {
  it('AC-4: 초기 6종 전체 — 전체 칩 + 6 지목 칩이 모두 aria-pressed=true', () => {
    render(<JimokFilter />)
    const states = pressedState()
    expect(states).toHaveLength(7)
    expect(states.every((s) => s.pressed === 'true')).toBe(true)
    // 라벨 표기 확인
    expect(screen.getByRole('button', { name: '전체' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '답(논)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '대지' })).toBeTruthy()
  })

  it('AC-5: 대지 칩 해제 시 대지만 false·전체도 false·스토어 5종', async () => {
    const user = userEvent.setup()
    render(<JimokFilter />)
    await user.click(screen.getByRole('button', { name: '대지' }))

    expect(screen.getByRole('button', { name: '대지' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('false')
    // '대' 제외한 5종 남음
    expect(useUiStore.getState().jimokFilter).not.toContain('대')
    expect(useUiStore.getState().jimokFilter).toHaveLength(5)
  })

  it('AC-6: 전체 칩 토글 — 부분→전체→빈', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ jimokFilter: ['답'] })
    render(<JimokFilter />)

    // 부분 상태면 전체 칩은 비선택
    expect(screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('false')

    // 전체 칩 클릭 → 6종 전부
    await user.click(screen.getByRole('button', { name: '전체' }))
    expect(useUiStore.getState().jimokFilter).toHaveLength(ALL_JIMOK.length)
    expect(screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('true')

    // 이미 전체에서 다시 클릭 → 빈 배열 (isAll 토글)
    await user.click(screen.getByRole('button', { name: '전체' }))
    expect(useUiStore.getState().jimokFilter).toEqual([])
  })

  it('AC-7: 빈 상태(전 지목 해제) — 7칩 모두 false·크래시 없음', () => {
    useUiStore.setState({ jimokFilter: [] })
    render(<JimokFilter />)
    const states = pressedState()
    expect(states).toHaveLength(7)
    expect(states.every((s) => s.pressed === 'false')).toBe(true)
  })

  it('필터 변경 시 선택·시트가 해제된다 (v1 useEffect 보존)', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ selectedParcelId: 'p1', openSheet: 'parcel' })
    render(<JimokFilter />)

    await user.click(screen.getByRole('button', { name: '대지' }))
    expect(useUiStore.getState().selectedParcelId).toBeNull()
    expect(useUiStore.getState().openSheet).toBeNull()
  })
})
