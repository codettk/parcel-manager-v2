import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sheet } from '../../../src/components/ui/Sheet'

// jsdom에는 matchMedia가 없으므로 스텁
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

describe('Sheet 반응형 분기', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('≥720px이면 SidePanel(우측 패널)로 렌더한다', () => {
    stubMatchMedia(true)
    render(<Sheet onClose={vi.fn()}>내용</Sheet>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('right-0')
    // SidePanel에는 grip이 없다
    expect(dialog.querySelector('.rounded-full')).toBeNull()
  })

  it('720px 미만이면 BottomSheet(grip 존재)로 렌더한다', () => {
    stubMatchMedia(false)
    render(<Sheet onClose={vi.fn()}>내용</Sheet>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('bottom-0')
    expect(dialog.querySelector('.rounded-full')).not.toBeNull()
  })
})
