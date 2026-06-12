import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ColorPicker } from '../../../src/components/ui/ColorPicker'

describe('ColorPicker', () => {
  it('type=color 입력으로 렌더되고 value가 반영된다', () => {
    render(<ColorPicker value="#6ca945" onChange={() => {}} aria-label="색상 선택" />)

    const input = screen.getByLabelText('색상 선택') as HTMLInputElement
    expect(input.type).toBe('color')
    expect(input.value).toBe('#6ca945')
  })

  it('변경 시 hex 문자열을 onChange로 돌려준다', () => {
    const onChange = vi.fn()
    render(<ColorPicker value="#6ca945" onChange={onChange} aria-label="색상 선택" />)

    fireEvent.change(screen.getByLabelText('색상 선택'), { target: { value: '#123456' } })
    expect(onChange).toHaveBeenCalledExactlyOnceWith('#123456')
  })

  it('disabled가 전달된다', () => {
    render(<ColorPicker value="#6ca945" onChange={() => {}} aria-label="색상 선택" disabled />)
    expect(screen.getByLabelText('색상 선택')).toBeDisabled()
  })
})
