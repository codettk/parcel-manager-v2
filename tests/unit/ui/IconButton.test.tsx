import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { X } from 'lucide-react'
import { IconButton } from '../../../src/components/ui/IconButton'

describe('IconButton', () => {
  it('aria-label로 렌더된다', () => {
    render(<IconButton icon={X} aria-label="닫기" />)
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument()
  })

  it('클릭 시 onClick이 호출된다', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<IconButton icon={X} aria-label="닫기" onClick={onClick} />)

    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disabled면 onClick이 호출되지 않는다', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<IconButton icon={X} aria-label="닫기" onClick={onClick} disabled />)

    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
