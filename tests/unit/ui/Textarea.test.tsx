import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Textarea } from '../../../src/components/ui/Textarea'

describe('Textarea', () => {
  it('rows 기본값 3으로 렌더된다', () => {
    render(<Textarea placeholder="메모" />)
    expect(screen.getByPlaceholderText('메모')).toHaveAttribute('rows', '3')
  })

  it('rows를 지정하면 그대로 적용된다', () => {
    render(<Textarea placeholder="메모" rows={5} />)
    expect(screen.getByPlaceholderText('메모')).toHaveAttribute('rows', '5')
  })

  it('입력 시 onChange가 호출된다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Textarea placeholder="메모" onChange={onChange} />)

    await user.type(screen.getByPlaceholderText('메모'), '논 매입 검토')
    expect(onChange).toHaveBeenCalled()
  })
})
