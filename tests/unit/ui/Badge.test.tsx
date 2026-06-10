import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Badge } from '../../../src/components/ui/Badge'

// vitest globals 미사용 — RTL 자동 cleanup이 동작하지 않아 명시 등록
afterEach(cleanup)

describe('Badge', () => {
  it('children을 렌더한다 (기본 variant)', () => {
    render(<Badge>3필지</Badge>)
    const el = screen.getByText('3필지')
    expect(el).toBeInTheDocument()
    expect(el.className).toContain('bg-surface-alt')
  })

  it('variant별 클래스가 적용된다', () => {
    render(
      <>
        <Badge variant="primary">P</Badge>
        <Badge variant="danger">D</Badge>
      </>,
    )
    expect(screen.getByText('P').className).toContain('bg-primary')
    expect(screen.getByText('D').className).toContain('bg-danger')
  })
})
