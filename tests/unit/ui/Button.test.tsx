import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../../../src/components/ui/Button'

describe('Button', () => {
  it('기본 variant(primary)로 렌더된다', () => {
    render(<Button>저장</Button>)
    const button = screen.getByRole('button', { name: '저장' })
    expect(button).toHaveClass('bg-primary')
    expect(button).toHaveAttribute('type', 'button')
  })

  it('danger variant 클래스를 적용한다', () => {
    render(<Button variant="danger">삭제</Button>)
    expect(screen.getByRole('button', { name: '삭제' })).toHaveClass('bg-danger')
  })

  it('클릭 시 onClick을 호출한다', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>저장</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disabled면 클릭해도 onClick이 호출되지 않는다', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        저장
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
