import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox } from '../../../src/components/ui/Checkbox'

describe('Checkbox', () => {
  it('라벨과 checked 상태가 렌더된다', () => {
    render(<Checkbox checked label="답" onChange={() => {}} />)
    expect(screen.getByRole('checkbox', { name: '답' })).toBeChecked()
  })

  it('라벨 클릭 시 반전된 값으로 onChange가 호출된다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Checkbox checked={false} label="전" onChange={onChange} />)

    await user.click(screen.getByText('전'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('disabled면 onChange가 호출되지 않는다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Checkbox checked={false} label="대" onChange={onChange} disabled />)

    await user.click(screen.getByText('대'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
