import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Chip } from '../../../src/components/ui/Chip'

describe('Chip', () => {
  it('children과 selected 상태(aria-pressed)가 렌더된다', () => {
    render(<Chip selected>답</Chip>)
    expect(screen.getByRole('button', { name: '답' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('클릭 시 onClick이 호출된다', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Chip onClick={onClick}>전</Chip>)

    await user.click(screen.getByRole('button', { name: '전' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('colorHex 지정 시 색 점이 표시된다', () => {
    const { container } = render(<Chip colorHex="#ff0000">빨강</Chip>)
    const dot = container.querySelector('span[style]')
    expect(dot).not.toBeNull()
    expect(dot).toHaveStyle({ backgroundColor: '#ff0000' })
  })
})
