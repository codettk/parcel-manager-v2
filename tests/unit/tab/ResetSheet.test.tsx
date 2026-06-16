import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResetSheet } from '../../../src/features/tab/ResetSheet'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { Group, ParcelOverride } from '../../../src/types/api/tabState'

// 명세: docs/specs/reset.md — AC-4~8 (시트 컴포넌트). AC-9/10은 워크스페이스 스토어, AC-11은 E2E.
const reset = vi.fn()

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

function makeOverride(patch: Partial<ParcelOverride>): ParcelOverride {
  return { color: null, style: null, name: null, memo: null, pinned: false, icon: null, ...patch }
}

function makeGroup(patch: Partial<Group>): Group {
  return { name: null, memo: null, color: null, style: 'fill', parcelIds: [], ...patch }
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  stubMatchMedia()
  useWorkspaceStore.setState({ reset })
  useUiStore.getState().openReset()
})

describe('AC-4: 카운트 표시 + 기본 체크', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      overrides: {
        p1: makeOverride({ color: 'eco', style: 'fill' }),
        p2: makeOverride({ color: 'sun', style: 'fill' }),
        p3: makeOverride({ color: 'sky', style: 'fill', name: '북단' }),
      },
      groups: { g1: makeGroup({ name: 'A' }), g2: makeGroup({ name: 'B' }) },
    })
  })

  it('항목별 카운트가 표시된다 (color 3·name 1·memo 0·group 2)', () => {
    render(<ResetSheet />)
    expect(screen.getByText('색상/표시 방식')).toBeInTheDocument()
    expect(screen.getByText('(3필지)')).toBeInTheDocument()
    expect(screen.getByText('(1필지)')).toBeInTheDocument()
    expect(screen.getByText('(0필지)')).toBeInTheDocument()
    expect(screen.getByText('(2개)')).toBeInTheDocument()
  })

  it('기본 체크는 color·group 두 항목이다', () => {
    render(<ResetSheet />)
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    // 순서: color, name, memo, group
    expect(boxes.map((b) => b.checked)).toEqual([true, false, false, true])
  })
})

describe('AC-5: 전체 해제 시 실행 비활성', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      overrides: { p1: makeOverride({ color: 'eco', style: 'fill' }) },
      groups: { g1: makeGroup({ name: 'A' }) },
    })
  })

  it('체크된 항목을 모두 해제하면 초기화 트리거가 disabled된다', async () => {
    render(<ResetSheet />)
    const user = userEvent.setup()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]

    expect(screen.getByRole('button', { name: '초기화' })).toBeEnabled()
    await user.click(boxes[0]) // color 해제
    await user.click(boxes[3]) // group 해제
    expect(screen.getByRole('button', { name: '초기화' })).toBeDisabled()
  })
})

describe('AC-6: ConfirmInline 2단계 → reset 1회', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      overrides: { p1: makeOverride({ color: 'eco', style: 'fill', name: '북단' }) },
      groups: { g1: makeGroup({ name: 'A' }) },
    })
  })

  it('초기화 1탭 → armed(취소/실행), 실행 탭 시 선택 items로 reset 1회 호출 후 닫힘', async () => {
    render(<ResetSheet />)
    const user = userEvent.setup()

    // color 외에 name도 켜서 선택 배열 검증
    await user.click((screen.getAllByRole('checkbox') as HTMLInputElement[])[1]) // name 체크
    await user.click(screen.getByRole('button', { name: '초기화' }))

    // armed 상태 — 취소/실행 쌍
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
    expect(reset).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '실행' }))
    expect(reset).toHaveBeenCalledExactlyOnceWith(['color', 'group', 'name'])
    expect(useUiStore.getState().resetSheetOpen).toBe(false)
  })
})

describe('AC-7: 빈 탭(대상 0) → disabled', () => {
  it('overrides·groups 모두 비면 카운트 0·트리거 disabled', () => {
    render(<ResetSheet />)
    expect(screen.getAllByText('(0필지)')).toHaveLength(3)
    expect(screen.getByText('(0개)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '초기화' })).toBeDisabled()
  })
})

describe('AC-8: 스냅샷 관련 요소 부재', () => {
  it('스냅샷 이름 입력·저장 후 초기화·히스토리·복원·전체 삭제가 존재하지 않는다', () => {
    useWorkspaceStore.setState({
      overrides: { p1: makeOverride({ color: 'eco', style: 'fill' }) },
    })
    render(<ResetSheet />)
    expect(screen.queryByText('저장 후 초기화')).not.toBeInTheDocument()
    expect(screen.queryByText(/히스토리/)).not.toBeInTheDocument()
    expect(screen.queryByText('복원')).not.toBeInTheDocument()
    expect(screen.queryByText('전체 삭제')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/스냅샷/)).not.toBeInTheDocument()
  })
})
