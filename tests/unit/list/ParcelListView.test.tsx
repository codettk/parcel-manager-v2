import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParcelListView } from '../../../src/features/list/ParcelListView'
import { resetParcelAreasCache } from '../../../src/features/list/useParcelAreas'
import { resetParcelIndexCache } from '../../../src/features/list/useParcelIndex'
import { api } from '../../../src/lib/api'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { ParcelOverride } from '../../../src/types/api/tabState'

// 명세: docs/specs/parcel-list.md — AC-7~AC-9 (컴포넌트 테스트). AC-10·11은 E2E(tester) 소관.
vi.mock('../../../src/lib/api', () => ({
  api: { parcels: { listAreas: vi.fn() }, tabState: { upsertGroup: vi.fn() } },
}))

// 정적 parcels.json — useParcelIndex의 fetch 경로 (목록은 id·jibun만 사용)
const PARCELS_JSON = {
  bbox: [0, 0, 1, 1],
  parcels: [
    { id: 'p1', jibun: '435-1', c: [] },
    { id: 'p2', jibun: '435-2', c: [] },
    { id: 'p3', jibun: '산 86', c: [] },
  ],
}

const COLORS_FIXTURE = [{ colorId: 'c-rice', label: '벼', hex: '#6CA945', sortOrder: 0 }]

const AREAS_FIXTURE = { p1: 1000, p2: null, p3: 2000 }

const EMPTY_OVERRIDE: ParcelOverride = {
  color: null,
  style: null,
  name: null,
  memo: null,
  pinned: false,
  icon: null,
}

function setupStores() {
  useWorkspaceStore.setState({
    colorLabels: COLORS_FIXTURE,
    overrides: { p3: { ...EMPTY_OVERRIDE, name: '양촌 가물치골' } },
    groups: {
      g1: { name: '방제반', memo: null, color: 'c-rice', style: 'fill', parcelIds: ['p1'] },
    },
  })
  useUiStore.setState({ isInitializing: false, listViewOpen: true })
}

/** 렌더 후 면적 출현까지 대기 — index/areas 비동기 로드를 act 안에서 소화한다 */
async function renderList() {
  const view = render(<ParcelListView />)
  await screen.findByText('1,000 ㎡')
  return view
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  resetParcelIndexCache()
  resetParcelAreasCache()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve(PARCELS_JSON) }))
  vi.mocked(api.parcels.listAreas).mockResolvedValue(AREAS_FIXTURE)
  setupStores()
})

describe('AC-7: 행 표기 (카운트·색 뱃지·환산 면적·그룹명·결측 -) + 단위 즉시 토글', () => {
  it('카운트와 각 행의 지번·색·면적·그룹명이 표시되고 결측은 -다', async () => {
    await renderList()

    expect(screen.getByTestId('list-count')).toHaveTextContent('3 / 3')
    expect(screen.getByTestId('list-count')).toHaveTextContent('필지')

    // p1: 그룹 소속 — 그룹 색 뱃지 + 그룹명
    const rowP1 = screen.getByRole('button', { name: /435-1/ })
    expect(within(rowP1).getByText('벼')).toBeInTheDocument()
    expect(within(rowP1).getByText('1,000 ㎡')).toBeInTheDocument()
    expect(within(rowP1).getByText('방제반')).toBeInTheDocument()

    // p3: 커스텀명 주 표기 + 지번 보조 병기
    const rowP3 = screen.getByRole('button', { name: /양촌 가물치골/ })
    expect(within(rowP3).getByText('산 86')).toBeInTheDocument()
    expect(within(rowP3).getByText('2,000 ㎡')).toBeInTheDocument()

    // p2: 색 없음·면적 null·그룹 없음 → 3개 컬럼 전부 '-'
    const rowP2 = screen.getByRole('button', { name: /435-2/ })
    expect(within(rowP2).getAllByText('-')).toHaveLength(3)
  })

  it('단위를 평으로 토글하면 면적 표기가 즉시 환산된다', async () => {
    const user = userEvent.setup()
    await renderList()

    await user.click(screen.getByRole('button', { name: '평' }))

    expect(await screen.findByText('302.5 평')).toBeInTheDocument()
    expect(screen.getByText('605 평')).toBeInTheDocument()
    expect(screen.queryByText('1,000 ㎡')).not.toBeInTheDocument()
    expect(useUiStore.getState().areaUnit).toBe('pyeong')
  })
})

describe('AC-8: 검색 0건 빈 상태 + clear 복귀', () => {
  it('결과 0건이면 "검색 결과 없음", clear(X) 버튼으로 전 행 복귀', async () => {
    const user = userEvent.setup()
    await renderList()

    await user.type(screen.getByPlaceholderText('지번·그룹명 검색…'), '존재하지않는지번')
    expect(await screen.findByText('검색 결과 없음')).toBeInTheDocument()
    expect(screen.getByTestId('list-count')).toHaveTextContent('0 / 3')

    await user.click(screen.getByRole('button', { name: '검색어 지우기' }))
    expect(await screen.findByRole('button', { name: /435-1/ })).toBeInTheDocument()
    expect(screen.getByTestId('list-count')).toHaveTextContent('3 / 3')
  })

  it('빈 상태의 "검색 초기화" 버튼으로도 전 행이 복귀한다', async () => {
    const user = userEvent.setup()
    await renderList()

    await user.type(screen.getByPlaceholderText('지번·그룹명 검색…'), '존재하지않는지번')
    await user.click(await screen.findByRole('button', { name: '검색 초기화' }))

    expect(await screen.findByRole('button', { name: /435-1/ })).toBeInTheDocument()
  })
})

describe('AC-9: 행 탭 = 시트 분기 직행 (모드 분기 비경유), 목록 열림 유지', () => {
  it('그룹 소속 행 탭 → 그룹 시트 열림 + listViewOpen 유지', async () => {
    const user = userEvent.setup()
    await renderList()

    await user.click(screen.getByRole('button', { name: /435-1/ }))

    const ui = useUiStore.getState()
    expect(ui.openSheet).toBe('group')
    expect(ui.selectedGroupId).toBe('g1')
    expect(ui.selectedParcelId).toBeNull()
    expect(ui.listViewOpen).toBe(true)
  })

  it('비소속 행 탭 → 필지 시트 열림 + listViewOpen 유지', async () => {
    const user = userEvent.setup()
    await renderList()

    await user.click(screen.getByRole('button', { name: /435-2/ }))

    const ui = useUiStore.getState()
    expect(ui.openSheet).toBe('parcel')
    expect(ui.selectedParcelId).toBe('p2')
    expect(ui.selectedGroupId).toBeNull()
    expect(ui.listViewOpen).toBe(true)
  })

  it('추가모드가 활성이어도 행 탭은 시트 직행 — 그룹 멤버십 무변경·서버 무호출 (B-1)', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ addToGroupModeGroupId: 'g1' })
    await renderList()

    await user.click(screen.getByRole('button', { name: /435-2/ }))

    const ui = useUiStore.getState()
    expect(ui.openSheet).toBe('parcel')
    expect(ui.selectedParcelId).toBe('p2')
    expect(useWorkspaceStore.getState().groups['g1']?.parcelIds).toEqual(['p1'])
    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
  })

  it('멀티선택 모드가 활성이어도 행 탭은 시트 직행 — 선택 집합 무변경 (B-1)', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ multiSelectMode: true, multiSelectedIds: [] })
    await renderList()

    await user.click(screen.getByRole('button', { name: /435-1/ }))

    const ui = useUiStore.getState()
    expect(ui.openSheet).toBe('group')
    expect(ui.selectedGroupId).toBe('g1')
    expect(ui.multiSelectedIds).toEqual([])
  })
})
