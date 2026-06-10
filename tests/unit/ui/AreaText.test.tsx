import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AreaText } from '../../../src/components/ui/AreaText'

// vitest globals 미사용 — RTL 자동 cleanup이 동작하지 않아 명시 등록
afterEach(cleanup)

describe('AreaText', () => {
  it('기본 단위(m2)로 렌더한다', () => {
    render(<AreaText m2={1234.56} />)
    expect(screen.getByText('1,234.6 ㎡')).toBeInTheDocument()
  })

  it('평 단위 환산: 1000㎡ → 302.5 평', () => {
    render(<AreaText m2={1000} unit="pyeong" />)
    expect(screen.getByText('302.5 평')).toBeInTheDocument()
  })

  it('숫자 정렬용 mono + tabular-nums 클래스를 가진다', () => {
    render(<AreaText m2={100} />)
    const el = screen.getByText('100 ㎡')
    expect(el.className).toContain('font-mono')
    expect(el.className).toContain('tabular-nums')
  })
})
