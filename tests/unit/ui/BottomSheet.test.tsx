import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BottomSheet } from '../../../src/components/ui/BottomSheet'

// fake timer와 user-event 충돌 회피를 위해 fireEvent 사용
describe('BottomSheet 400ms 닫힘 가드', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('마운트 직후 backdrop 클릭은 onClose를 호출하지 않는다', () => {
    const onClose = vi.fn()
    render(<BottomSheet onClose={onClose}>내용</BottomSheet>)
    fireEvent.click(screen.getByTestId('sheet-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('400ms 경과 후 backdrop 클릭은 onClose를 호출한다', () => {
    const onClose = vi.fn()
    render(<BottomSheet onClose={onClose}>내용</BottomSheet>)
    vi.advanceTimersByTime(400)
    fireEvent.click(screen.getByTestId('sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('children과 grip을 렌더한다', () => {
    render(
      <BottomSheet onClose={vi.fn()}>
        <p>시트 내용</p>
      </BottomSheet>,
    )
    expect(screen.getByText('시트 내용')).toBeInTheDocument()
    expect(screen.getByRole('dialog').querySelector('.rounded-full')).not.toBeNull()
  })
})
