import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from '../../../src/components/ui/Input'

describe('Input', () => {
  it('placeholder로 렌더되고 입력 시 onChange가 호출된다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Input placeholder="이름" onChange={onChange} />)

    await user.type(screen.getByPlaceholderText('이름'), '가')
    expect(onChange).toHaveBeenCalled()
  })

  it('numeric variant는 inputMode=decimal을 가진다', () => {
    render(<Input variant="numeric" placeholder="면적" />)
    expect(screen.getByPlaceholderText('면적')).toHaveAttribute('inputmode', 'decimal')
  })

  it('기본 variant는 inputMode가 없다', () => {
    render(<Input placeholder="이름" />)
    expect(screen.getByPlaceholderText('이름')).not.toHaveAttribute('inputmode')
  })
})
