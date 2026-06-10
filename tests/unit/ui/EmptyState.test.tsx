import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SearchX } from 'lucide-react'
import { EmptyState } from '../../../src/components/ui/EmptyState'

// vitest globals 미사용 — RTL 자동 cleanup이 동작하지 않아 명시 등록
afterEach(cleanup)

describe('EmptyState', () => {
  it('메시지를 렌더한다', () => {
    render(<EmptyState message="검색 결과 없음" />)
    expect(screen.getByText('검색 결과 없음')).toBeInTheDocument()
  })

  it('icon과 action을 함께 렌더한다', () => {
    const { container } = render(
      <EmptyState
        icon={SearchX}
        message="비어 있음"
        action={<button type="button">다시 시도</button>}
      />,
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})
