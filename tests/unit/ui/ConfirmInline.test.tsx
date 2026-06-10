import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmInline } from '../../../src/components/ui/ConfirmInline'

// vitest globals 미사용 — RTL 자동 cleanup이 동작하지 않아 명시 등록
afterEach(cleanup)

describe('ConfirmInline', () => {
  it('1단계: 트리거 버튼만 보이고 onConfirm은 호출되지 않는다', () => {
    const onConfirm = vi.fn()
    render(<ConfirmInline label="전체 삭제" onConfirm={onConfirm} />)
    expect(screen.getByRole('button', { name: '전체 삭제' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '실행' })).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('트리거 클릭 → 실행 클릭 시에만 onConfirm 호출 후 1단계 복귀', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmInline label="전체 삭제" onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: '전체 삭제' }))
    expect(onConfirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '실행' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '전체 삭제' })).toBeInTheDocument()
  })

  it('취소 클릭 시 onConfirm 미호출, 1단계로 복귀한다', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmInline label="초기화" confirmLabel="초기화 실행" onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: '초기화' }))
    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '초기화' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '초기화 실행' })).not.toBeInTheDocument()
  })

  it('disabled면 트리거가 비활성화된다', () => {
    render(<ConfirmInline label="삭제" onConfirm={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
  })
})
