import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Switch } from '../../../src/components/ui/Switch'

describe('Switch', () => {
  it('role=switch와 aria-checked가 렌더된다', () => {
    render(<Switch checked label="고정" onChange={() => {}} />)
    expect(screen.getByRole('switch', { name: '고정' })).toHaveAttribute('aria-checked', 'true')
  })

  it('클릭 시 반전된 값으로 onChange가 호출된다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch checked={false} label="고정" onChange={onChange} />)

    await user.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('disabled면 onChange가 호출되지 않는다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch checked onChange={onChange} disabled />)

    await user.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
