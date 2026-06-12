import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalculatorResultSheet } from '../../../src/features/calculator/CalculatorResultSheet'
import { api } from '../../../src/lib/api'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { CalcRecipe } from '../../../src/types/api/calcRecipes'
import type { Parcel } from '../../../src/types/api/parcels'
import type { Group } from '../../../src/types/api/tabState'

// 명세: docs/specs/calculator.md — AC-7~AC-9 (결과 시트 컴포넌트 테스트). AC-11/12는 E2E(tester) 소관.
vi.mock('../../../src/lib/api', () => ({
  api: { parcels: { get: vi.fn() } },
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

function makeParcel(localId: string, jibun: string, lndpclAr: number | null): Parcel {
  return {
    localId,
    pnu: null,
    jibun,
    jibunFull: `경기도 김포시 월곶면 보구곶리 ${jibun}`,
    ldCode: null,
    ldCodeNm: null,
    lndcgrCode: null,
    lndcgrCodeNm: null,
    lndpclAr,
    posesnSeCode: null,
    posesnSeCodeNm: null,
    cnrsPsnCo: null,
    regstrSeCode: null,
    regstrSeCodeNm: null,
    coordinates: [],
    vworldFetchedAt: null,
  }
}

const RECIPES_FIXTURE: CalcRecipe[] = [
  { id: 'r1', name: '석회', baseArea: 300, baseUnit: '㎡', amount: 300, amountUnit: 'L' },
  { id: 'r2', name: '비료', baseArea: 300, baseUnit: '㎡', amount: 20, amountUnit: 'kg' },
]

const GROUP_FIXTURE: Group = {
  name: '윗논',
  memo: null,
  color: null,
  style: 'fill',
  parcelIds: ['p1', 'p2', 'p3'],
}

function setupStores(opts: { groups?: Record<string, Group>; recipes?: CalcRecipe[] } = {}) {
  useWorkspaceStore.setState({
    groups: opts.groups ?? {},
    calcRecipes: opts.recipes ?? RECIPES_FIXTURE,
  })
  useUiStore.setState({
    isInitializing: false,
    calculatorActive: true,
    openSheet: 'calcResult',
    selectedParcelId: 'p1',
  })
}

function mockParcels(parcels: Record<string, Parcel>) {
  vi.mocked(api.parcels.get).mockImplementation((pid: string) => {
    const parcel = parcels[pid]
    return parcel !== undefined ? Promise.resolve(parcel) : Promise.reject(new Error('404'))
  })
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  stubMatchMedia()
})

describe('AC-7: 비그룹 필지 — 지번 헤더·면적·레시피 계산값, 토글 없음, 단위는 표시 전용', () => {
  it('지번 헤더와 레시피별 계산값+단위 행이 표시되고 개별/그룹 토글이 없다', async () => {
    setupStores()
    mockParcels({ p1: makeParcel('p1', '128-4', 600) })
    render(<CalculatorResultSheet parcelId="p1" />)

    expect(await screen.findByText('600 ㎡')).toBeInTheDocument()
    expect(screen.getByText('128-4')).toBeInTheDocument()
    // 600㎡ × {300㎡당 300 L} = 600 L, × {300㎡당 20 kg} = 40 kg
    expect(screen.getByText('석회')).toBeInTheDocument()
    expect(screen.getByText('600 L')).toBeInTheDocument()
    expect(screen.getByText('비료')).toBeInTheDocument()
    expect(screen.getByText('40 kg')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /그룹 전체/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '개별 지번' })).not.toBeInTheDocument()
  })

  it("단위를 '평'으로 토글하면 면적 표기만 바뀌고 계산 결과는 불변이다", async () => {
    setupStores()
    mockParcels({ p1: makeParcel('p1', '128-4', 600) })
    render(<CalculatorResultSheet parcelId="p1" />)
    await screen.findByText('600 ㎡')
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '평' }))

    expect(screen.getByText('181.5 평')).toBeInTheDocument() // 600 × 0.3025
    expect(screen.getByText('600 L')).toBeInTheDocument() // 계산은 ㎡ 원본 기준 — 불변
    expect(screen.getByText('40 kg')).toBeInTheDocument()
  })
})

describe('AC-8: 그룹 소속 필지 — 기본 그룹 전체(known 합산) + 개별 전환 시 재계산·강조 해제', () => {
  it("기본 '그룹 전체 (3필지)' + known 합산 면적 결과 + selectedGroupId 설정", async () => {
    setupStores({ groups: { g1: GROUP_FIXTURE } })
    mockParcels({
      p1: makeParcel('p1', '128-4', 600),
      p2: makeParcel('p2', '128-5', 1000),
      p3: makeParcel('p3', '128-6', null), // 면적 미상 — 합산 제외
    })
    render(<CalculatorResultSheet parcelId="p1" />)

    // 합산 = 600 + 1000 (p3 제외) → 석회 1600/300×300 = 1600 L
    expect(await screen.findByText('1,600 ㎡')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '그룹 전체 (3필지)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('윗논')).toBeInTheDocument()
    expect(screen.getByText('1,600 L')).toBeInTheDocument()
    expect(useUiStore.getState().selectedGroupId).toBe('g1')
  })

  it("'개별 지번' 전환 시 해당 필지 면적으로 재계산되고 selectedGroupId가 해제된다", async () => {
    setupStores({ groups: { g1: GROUP_FIXTURE } })
    mockParcels({
      p1: makeParcel('p1', '128-4', 600),
      p2: makeParcel('p2', '128-5', 1000),
      p3: makeParcel('p3', '128-6', null),
    })
    render(<CalculatorResultSheet parcelId="p1" />)
    await screen.findByText('1,600 ㎡')
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '개별 지번' }))

    expect(screen.getByText('600 ㎡')).toBeInTheDocument()
    expect(screen.getByText('128-4')).toBeInTheDocument() // 헤더가 그룹명 → 지번
    expect(screen.getByText('600 L')).toBeInTheDocument()
    expect(useUiStore.getState().selectedGroupId).toBeNull()
  })
})

describe('AC-9: 안내 문구 — 면적 null / 레시피 0개', () => {
  it('유효 면적이 null이면 면적 안내가 표시되고 계산 행이 없다', async () => {
    setupStores()
    mockParcels({ p1: makeParcel('p1', '128-4', null) })
    render(<CalculatorResultSheet parcelId="p1" />)

    expect(await screen.findByText(/면적 정보가 없습니다/)).toBeInTheDocument()
    expect(screen.queryByText('석회')).not.toBeInTheDocument()
    expect(screen.queryByText('레시피별 투입량')).not.toBeInTheDocument()
  })

  it('전 멤버 면적이 null인 그룹은 그룹 문안으로 안내한다 (v1 보존)', async () => {
    setupStores({ groups: { g1: GROUP_FIXTURE } })
    mockParcels({
      p1: makeParcel('p1', '128-4', null),
      p2: makeParcel('p2', '128-5', null),
      p3: makeParcel('p3', '128-6', null),
    })
    render(<CalculatorResultSheet parcelId="p1" />)

    expect(await screen.findByText(/그룹 내 필지의 면적 정보가 없습니다/)).toBeInTheDocument()
  })

  it('면적은 있으나 레시피가 0개면 빈 안내가 표시된다', async () => {
    setupStores({ recipes: [] })
    mockParcels({ p1: makeParcel('p1', '128-4', 600) })
    render(<CalculatorResultSheet parcelId="p1" />)

    expect(await screen.findByText(/설정된 계산 항목이 없습니다/)).toBeInTheDocument()
    expect(screen.getByText('600 ㎡')).toBeInTheDocument()
  })
})
