import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaletteSheet } from '../../../src/features/palette/PaletteSheet'
import { api } from '../../../src/lib/api'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { ColorLabel } from '../../../src/types/api/colors'
import type { ParcelOverride } from '../../../src/types/api/tabState'

// 명세: docs/specs/color-palette.md — AC-3·AC-4·AC-5 (시트 컴포넌트 테스트). AC-6/7은 E2E(tester) 소관.
vi.mock('../../../src/lib/api', () => ({
  api: { colors: { put: vi.fn(), remove: vi.fn() } },
}))

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

// 네이티브 컬러 피커는 소문자 hex를 돌려주므로 픽스처도 소문자로 고정
const COLORS_FIXTURE: ColorLabel[] = [
  { colorId: 'eco', label: '매수 예정', hex: '#6ca945', sortOrder: 0 },
  { colorId: 'sun', label: '매수 완료', hex: '#d9a441', sortOrder: 1 },
  { colorId: 'sky', label: '임차', hex: '#5b8fb9', sortOrder: 2 },
]

function makeOverride(patch: Partial<ParcelOverride>): ParcelOverride {
  return { color: null, style: null, name: null, memo: null, pinned: false, icon: null, ...patch }
}

function pickerValues(): string[] {
  return screen.getAllByLabelText('색상 선택').map((el) => (el as HTMLInputElement).value)
}

function labelValues(): string[] {
  return screen.getAllByLabelText('색상 이름').map((el) => (el as HTMLInputElement).value)
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  stubMatchMedia()
  vi.mocked(api.colors.put).mockResolvedValue({ ok: true })
  vi.mocked(api.colors.remove).mockResolvedValue({ ok: true })
  useWorkspaceStore.setState({ colorLabels: COLORS_FIXTURE })
  useUiStore.getState().openPalette()
})

describe('AC-3: 행 표시 + 편집 + 추가 + X 닫기 draft 폐기', () => {
  it('행마다 컬러 피커(hex)와 라벨 입력이 표시된다', () => {
    render(<PaletteSheet />)

    expect(pickerValues()).toEqual(['#6ca945', '#d9a441', '#5b8fb9'])
    expect(labelValues()).toEqual(['매수 예정', '매수 완료', '임차'])
  })

  it('라벨·hex 수정 후 "+ 색상 추가"는 새 행("새 색상"/#888888)을 맨 뒤에 추가하고, X 닫기는 put/remove를 호출하지 않는다', async () => {
    render(<PaletteSheet />)
    const user = userEvent.setup()

    await user.type(screen.getAllByLabelText('색상 이름')[0], '_과수원')
    fireEvent.change(screen.getAllByLabelText('색상 선택')[0], { target: { value: '#123456' } })
    expect(labelValues()[0]).toBe('매수 예정_과수원')
    expect(pickerValues()[0]).toBe('#123456')

    await user.click(screen.getByRole('button', { name: '+ 색상 추가' }))
    expect(labelValues()).toEqual(['매수 예정_과수원', '매수 완료', '임차', '새 색상'])
    expect(pickerValues()[3]).toBe('#888888')

    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(api.colors.put).not.toHaveBeenCalled()
    expect(api.colors.remove).not.toHaveBeenCalled()
    expect(useUiStore.getState().paletteOpen).toBe(false)
    // 스토어 원본도 불변 — draft 폐기
    expect(useWorkspaceStore.getState().colorLabels).toEqual(COLORS_FIXTURE)
  })
})

describe('AC-4: 2단계 삭제 확인 + 저장 시 DELETE→PUT 순서', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      overrides: {
        p1: makeOverride({ color: 'eco', style: 'fill' }),
        p2: makeOverride({ color: 'eco', style: 'border' }),
      },
    })
  })

  it('삭제 버튼 1탭은 행을 지우지 않고 참조 수 문구를 표시한다', async () => {
    render(<PaletteSheet />)
    const user = userEvent.setup()

    await user.click(screen.getAllByRole('button', { name: '색상 삭제' })[0])

    expect(labelValues()).toEqual(['매수 예정', '매수 완료', '임차'])
    expect(screen.getByText(/필지 2개/)).toBeInTheDocument()
    expect(api.colors.remove).not.toHaveBeenCalled()
  })

  it('확인 탭은 draft에서만 제거(API 미호출), 저장은 remove→put 순으로 호출 후 닫는다', async () => {
    render(<PaletteSheet />)
    const user = userEvent.setup()

    await user.click(screen.getAllByRole('button', { name: '색상 삭제' })[0])
    await user.click(screen.getByRole('button', { name: '삭제' }))

    expect(labelValues()).toEqual(['매수 완료', '임차'])
    expect(api.colors.remove).not.toHaveBeenCalled()
    expect(api.colors.put).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(api.colors.remove).toHaveBeenCalledExactlyOnceWith('eco')
    // 남은 색 + 행 인덱스로 재계산된 sortOrder
    expect(api.colors.put).toHaveBeenCalledExactlyOnceWith({
      colors: [
        { colorId: 'sun', label: '매수 완료', hex: '#d9a441', sortOrder: 0 },
        { colorId: 'sky', label: '임차', hex: '#5b8fb9', sortOrder: 1 },
      ],
    })
    expect(vi.mocked(api.colors.remove).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.colors.put).mock.invocationCallOrder[0],
    )
    expect(useUiStore.getState().paletteOpen).toBe(false)
  })

  it('취소 탭은 확인 UI만 접고 행을 유지한다', async () => {
    render(<PaletteSheet />)
    const user = userEvent.setup()

    await user.click(screen.getAllByRole('button', { name: '색상 삭제' })[0])
    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(labelValues()).toEqual(['매수 예정', '매수 완료', '임차'])
    expect(screen.queryByText(/필지 2개/)).not.toBeInTheDocument()
  })
})

describe('AC-5: 빈 라벨 시 저장 비활성', () => {
  it('라벨을 모두 지우면 저장이 비활성, 다시 입력하면 활성으로 복귀한다', async () => {
    render(<PaletteSheet />)
    const user = userEvent.setup()
    const firstLabel = screen.getAllByLabelText('색상 이름')[0]

    await user.clear(firstLabel)
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()

    await user.type(firstLabel, '과수원')
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  })
})
