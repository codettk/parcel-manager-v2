import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ColorSwatch } from '../../../src/components/ui/ColorSwatch'

// vitest globals 미사용 — RTL 자동 cleanup이 동작하지 않아 명시 등록
afterEach(cleanup)

const HEX = '#2f7d4f'
const RGB = 'rgb(47, 125, 79)' // jsdom이 hex를 rgb로 정규화

describe('ColorSwatch', () => {
  it('fill 모드: 색 채움 + 같은 색 테두리', () => {
    render(<ColorSwatch hex={HEX} styleMode="fill" />)
    const el = screen.getByTestId('color-swatch')
    expect(el).toBeInTheDocument()
    expect(el.style.backgroundColor).toContain(RGB)
    expect(el.style.borderColor).toBe(RGB)
  })

  it('border 모드: 배경 채움 없이 색 테두리만', () => {
    render(<ColorSwatch hex={HEX} styleMode="border" />)
    const el = screen.getByTestId('color-swatch')
    expect(el.style.borderColor).toBe(RGB)
    expect(el.style.backgroundColor).toBe('')
  })

  it('selected/size에 따라 클래스가 달라진다', () => {
    render(<ColorSwatch hex={HEX} styleMode="fill" selected size="sm" />)
    const el = screen.getByTestId('color-swatch')
    expect(el.className).toContain('ring-2')
    expect(el.className).toContain('h-4')
  })
})
