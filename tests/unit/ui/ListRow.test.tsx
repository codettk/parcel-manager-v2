import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListRow } from '../../../src/components/ui/ListRow'

// vitest globals 미사용 — RTL 자동 cleanup이 동작하지 않아 명시 등록
afterEach(cleanup)

describe('ListRow', () => {
  it('title/subtitle/leading/trailing을 렌더한다', () => {
    render(
      <ListRow
        title="산 12-3"
        subtitle="그룹 A"
        leading={<span data-testid="lead" />}
        trailing={<span data-testid="trail" />}
      />,
    )
    expect(screen.getByText('산 12-3')).toBeInTheDocument()
    expect(screen.getByText('그룹 A')).toBeInTheDocument()
    expect(screen.getByTestId('lead')).toBeInTheDocument()
    expect(screen.getByTestId('trail')).toBeInTheDocument()
  })

  it('onClick이 없으면 button 시맨틱이 아니다', () => {
    render(<ListRow title="정적 행" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('onClick이 있으면 button으로 렌더되고 클릭 시 호출된다', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ListRow title="클릭 행" onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: '클릭 행' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
