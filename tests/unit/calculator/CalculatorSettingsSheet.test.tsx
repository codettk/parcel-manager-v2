import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalculatorSettingsSheet } from '../../../src/features/calculator/CalculatorSettingsSheet'
import { api } from '../../../src/lib/api'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { CalcRecipe } from '../../../src/types/api/calcRecipes'

// 명세: docs/specs/calculator.md — AC-5·AC-6 (설정 시트 컴포넌트 테스트). AC-11/12는 E2E(tester) 소관.
vi.mock('../../../src/lib/api', () => ({
  api: { calcRecipes: { get: vi.fn(), put: vi.fn() } },
}))

// jsdom에는 matchMedia가 없으므로 스텁 (Sheet → useIsWide). false = BottomSheet 경로
function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
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

const RECIPES_FIXTURE: CalcRecipe[] = [
  { id: 'r1', name: '석회', baseArea: 300, baseUnit: '㎡', amount: 300, amountUnit: 'L' },
  { id: 'r2', name: '농약', baseArea: 1, baseUnit: '평', amount: 0.5, amountUnit: 'mL' },
]

const onClose = vi.fn()
const onStart = vi.fn()

/** 렌더 후 draft 초기화(GET → 스토어 갱신 → 행 출현)까지 대기 */
async function renderSheet() {
  const view = render(<CalculatorSettingsSheet onClose={onClose} onStart={onStart} />)
  await screen.findByDisplayValue('석회')
  return view
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  stubMatchMedia()
  vi.mocked(api.calcRecipes.get).mockResolvedValue({ recipes: RECIPES_FIXTURE })
  vi.mocked(api.calcRecipes.put).mockResolvedValue({ ok: true })
})

describe('AC-5: 저장 레시피 표시 + 행 추가/삭제', () => {
  it('행별 자재명·기준면적·기준단위·투입량·투입단위가 표시된다', async () => {
    await renderSheet()

    expect(screen.getAllByLabelText('자재명').map((el) => (el as HTMLInputElement).value)).toEqual([
      '석회',
      '농약',
    ])
    expect(
      screen.getAllByLabelText('기준 면적').map((el) => (el as HTMLInputElement).value),
    ).toEqual(['300', '1'])
    expect(
      screen.getAllByLabelText('기준 단위').map((el) => (el as HTMLSelectElement).value),
    ).toEqual(['㎡', '평'])
    expect(screen.getAllByLabelText('투입량').map((el) => (el as HTMLInputElement).value)).toEqual([
      '300',
      '0.5',
    ])
    expect(
      screen.getAllByLabelText('투입 단위').map((el) => (el as HTMLInputElement).value),
    ).toEqual(['L', 'mL'])
  })

  it('"+ 항목 추가"는 기본값(300, ㎡, 0, L) 행을 추가한다', async () => {
    await renderSheet()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '+ 항목 추가' }))

    expect(screen.getAllByLabelText('자재명')).toHaveLength(3)
    expect((screen.getAllByLabelText('자재명')[2] as HTMLInputElement).value).toBe('')
    expect((screen.getAllByLabelText('기준 면적')[2] as HTMLInputElement).value).toBe('300')
    expect((screen.getAllByLabelText('기준 단위')[2] as HTMLSelectElement).value).toBe('㎡')
    expect((screen.getAllByLabelText('투입량')[2] as HTMLInputElement).value).toBe('0')
    expect((screen.getAllByLabelText('투입 단위')[2] as HTMLInputElement).value).toBe('L')
  })

  it('행 삭제 버튼은 해당 행만 제거한다', async () => {
    await renderSheet()
    const user = userEvent.setup()

    await user.click(screen.getAllByRole('button', { name: '항목 삭제' })[0])

    expect(screen.getAllByLabelText('자재명').map((el) => (el as HTMLInputElement).value)).toEqual([
      '농약',
    ])
  })
})

describe('AC-6: 문자열 draft + 저장/폐기', () => {
  it('"12.a3" 타이핑은 "12.3"으로 필터되고 "1." 중간 상태가 유지된다', async () => {
    await renderSheet()
    const user = userEvent.setup()
    const baseAreaInput = screen.getAllByLabelText('기준 면적')[0]

    // focus 시 전체 선택(v1 보존) — 첫 키 입력이 기존 값 '300'을 대체한다
    await user.type(baseAreaInput, '12.a3')
    expect((baseAreaInput as HTMLInputElement).value).toBe('12.3')

    await user.clear(baseAreaInput)
    await user.type(baseAreaInput, '1.')
    expect((baseAreaInput as HTMLInputElement).value).toBe('1.')
  })

  it('"저장"은 숫자 변환된 배열로 put 1회 + 닫기, X 닫기는 put 미호출 (draft 폐기)', async () => {
    await renderSheet()
    const user = userEvent.setup()

    await user.type(screen.getAllByLabelText('기준 면적')[0], '12.a3')
    expect(api.calcRecipes.put).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(api.calcRecipes.put).toHaveBeenCalledExactlyOnceWith({
      recipes: [{ ...RECIPES_FIXTURE[0], baseArea: 12.3 }, RECIPES_FIXTURE[1]],
    })
    expect(onClose).toHaveBeenCalledOnce()
    expect(useWorkspaceStore.getState().calcRecipes).toEqual([
      { ...RECIPES_FIXTURE[0], baseArea: 12.3 },
      RECIPES_FIXTURE[1],
    ])
  })

  it('X로 닫으면 편집했어도 put이 호출되지 않는다', async () => {
    await renderSheet()
    const user = userEvent.setup()

    await user.type(screen.getAllByLabelText('자재명')[0], '비료')
    await user.click(screen.getByRole('button', { name: '닫기' }))

    expect(api.calcRecipes.put).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('"계산 시작"은 저장(put 1회) 후 onStart를 호출한다', async () => {
    await renderSheet()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '계산 시작' }))

    expect(api.calcRecipes.put).toHaveBeenCalledExactlyOnceWith({ recipes: RECIPES_FIXTURE })
    expect(onStart).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })
})
