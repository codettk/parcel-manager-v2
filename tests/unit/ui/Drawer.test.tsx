import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Drawer, DrawerSection } from '../../../src/components/ui/Drawer'
import { DrawerItem } from '../../../src/components/ui/DrawerItem'

describe('Drawer', () => {
  it('open=false면 아무것도 렌더하지 않는다', () => {
    render(
      <Drawer open={false} onClose={vi.fn()}>
        내용
      </Drawer>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('open=true면 children을 렌더한다', () => {
    render(
      <Drawer open onClose={vi.fn()}>
        <DrawerSection title="도구">
          <span>지번 목록</span>
        </DrawerSection>
      </Drawer>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('도구')).toBeInTheDocument()
    expect(screen.getByText('지번 목록')).toBeInTheDocument()
  })

  it('backdrop 클릭 시 onClose를 호출한다', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Drawer open onClose={onClose}>
        내용
      </Drawer>,
    )
    await user.click(screen.getByTestId('drawer-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('DrawerItem', () => {
  it('클릭 시 onClick을 호출한다', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<DrawerItem label="색상 이름 설정" onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: '색상 이름 설정' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('active면 aria-current를 표시하고 trailing을 렌더한다', () => {
    render(<DrawerItem label="지번 목록" onClick={vi.fn()} active trailing={<span>12</span>} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})
