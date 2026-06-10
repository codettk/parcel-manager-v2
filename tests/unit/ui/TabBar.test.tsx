import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabBar, type TabBarProps } from '../../../src/components/ui/TabBar'

const TABS = [
  { id: 't1', name: '작업A' },
  { id: 't2', name: '작업B' },
]

function renderTabBar(override: Partial<TabBarProps> = {}) {
  const props: TabBarProps = {
    tabs: TABS,
    activeId: 't1',
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onClose: vi.fn(),
    onRename: vi.fn(),
    ...override,
  }
  render(<TabBar {...props} />)
  return props
}

describe('TabBar', () => {
  it('탭 목록을 렌더하고 활성 탭에 aria-selected를 표시한다', () => {
    renderTabBar()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('비활성 탭 클릭 시 onSelect를 호출한다', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderTabBar()
    await user.click(screen.getByText('작업B'))
    expect(onSelect).toHaveBeenCalledWith('t2')
  })

  it('활성 탭 더블클릭 → 인라인 편집 → Enter로 onRename을 호출한다', async () => {
    const user = userEvent.setup()
    const { onRename } = renderTabBar()
    await user.dblClick(screen.getByText('작업A'))
    const input = screen.getByRole('textbox', { name: '탭 이름 편집' })
    await user.clear(input)
    await user.type(input, '새 작업{Enter}')
    expect(onRename).toHaveBeenCalledWith('t1', '새 작업')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('인라인 편집 중 Escape면 onRename 없이 취소한다', async () => {
    const user = userEvent.setup()
    const { onRename } = renderTabBar()
    await user.dblClick(screen.getByText('작업A'))
    await user.keyboard('{Escape}')
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('작업A')).toBeInTheDocument()
  })

  it('닫기(×) 클릭 시 onClose를 호출하고 onSelect는 호출하지 않는다', async () => {
    const user = userEvent.setup()
    const { onClose, onSelect } = renderTabBar()
    await user.click(screen.getByRole('button', { name: '작업B 닫기' }))
    expect(onClose).toHaveBeenCalledWith('t2')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('추가 버튼 클릭 시 onAdd를 호출한다', async () => {
    const user = userEvent.setup()
    const { onAdd } = renderTabBar()
    await user.click(screen.getByRole('button', { name: '탭 추가' }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
})
