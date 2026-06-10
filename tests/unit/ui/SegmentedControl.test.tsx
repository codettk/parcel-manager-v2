import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentedControl } from '../../../src/components/ui/SegmentedControl'

const OPTIONS = [
  { id: 'm2', label: '㎡' },
  { id: 'pyeong', label: '평' },
  { id: 'ha', label: 'ha' },
]

describe('SegmentedControl', () => {
  it('모든 옵션이 렌더되고 현재 값에 aria-pressed가 설정된다', () => {
    render(<SegmentedControl options={OPTIONS} value="pyeong" onChange={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: '평' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '㎡' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('세그먼트 클릭 시 해당 id로 onChange가 호출된다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SegmentedControl options={OPTIONS} value="m2" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'ha' }))
    expect(onChange).toHaveBeenCalledWith('ha')
  })
})
