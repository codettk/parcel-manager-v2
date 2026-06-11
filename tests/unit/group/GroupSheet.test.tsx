import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GroupSheet } from '../../../src/features/group/GroupSheet'
import { api } from '../../../src/lib/api'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { Parcel } from '../../../src/types/api/parcels'
import type { Group } from '../../../src/types/api/tabState'

// 명세: docs/specs/group-management.md — AC-7~AC-10 (그룹 시트 컴포넌트 테스트). AC-11~14는 E2E(tester) 소관.
vi.mock('../../../src/lib/api', () => ({
  api: { parcels: { get: vi.fn() }, tabState: { upsertGroup: vi.fn() } },
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

const PARCELS: Record<string, Parcel> = {
  p1: makeParcel('p1', '산 123', 1000),
  p2: makeParcel('p2', '산 124', 2000),
}

const COLORS_FIXTURE = [
  { colorId: 'c-red', label: '빨강', hex: '#FF0000', sortOrder: 0 },
  { colorId: 'c-blue', label: '파랑', hex: '#0000FF', sortOrder: 1 },
]

const GROUP_FIXTURE: Group = {
  name: '윗논',
  memo: '그룹 메모',
  color: 'c-red',
  style: 'fill',
  parcelIds: ['p1', 'p2'],
}

let upsertGroupMock: Mock
let commitGroupDraftMock: Mock
let cancelGroupDraftMock: Mock
let updateDraftGroupMembersMock: Mock

function setupStores(group: Group, isPending = false) {
  useWorkspaceStore.setState({
    activeTabId: 'tab_a',
    colorLabels: COLORS_FIXTURE,
    groups: { g1: group },
    pendingGroupCreate: isPending ? { groupId: 'g1', originalAffectedGroups: {} } : null,
    upsertGroup: upsertGroupMock,
    commitGroupDraft: commitGroupDraftMock,
    cancelGroupDraft: cancelGroupDraftMock,
    updateDraftGroupMembers: updateDraftGroupMembersMock,
  })
  useUiStore.setState({ isInitializing: false, openSheet: 'group', selectedGroupId: 'g1' })
}

/** 렌더 후 멤버 지번 출현까지 대기 — api.parcels.get 비동기 setState를 act 안에서 소화한다 */
async function renderSheet() {
  const view = render(<GroupSheet groupId="g1" />)
  await screen.findByText('산 123')
  return view
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  stubMatchMedia()
  upsertGroupMock = vi.fn()
  // 실제 액션처럼 pending을 해제해야 closeSheet의 pending 연동이 이중 호출되지 않는다
  commitGroupDraftMock = vi.fn(() => useWorkspaceStore.setState({ pendingGroupCreate: null }))
  cancelGroupDraftMock = vi.fn(() => useWorkspaceStore.setState({ pendingGroupCreate: null }))
  updateDraftGroupMembersMock = vi.fn()
  vi.mocked(api.parcels.get).mockImplementation((pid: string) => {
    const parcel = PARCELS[pid]
    return parcel !== undefined ? Promise.resolve(parcel) : Promise.reject(new Error('404'))
  })
})

describe('AC-7: 그룹 값으로 초기화 + 멤버 목록 + 색상 없으면 표시 방식 비활성', () => {
  it('"2필지" 배지·draft 초기값·멤버 지번 2개가 표시된다', async () => {
    setupStores(GROUP_FIXTURE)
    await renderSheet()

    expect(screen.getByText('2필지')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '그룹 이름' })).toHaveValue('윗논')
    expect(screen.getByRole('textbox', { name: '메모' })).toHaveValue('그룹 메모')
    expect(screen.getByRole('button', { name: '빨강' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('포함 필지 (2)')).toBeInTheDocument()
    expect(screen.getByText('산 123')).toBeInTheDocument()
    expect(screen.getByText('산 124')).toBeInTheDocument()
    // 합계 면적 = 멤버 lndpclAr 합산 (1,000 + 2,000)
    expect(screen.getByText('3,000 ㎡')).toBeInTheDocument()
  })

  it('draft.color를 "없음"으로 바꾸면 표시 방식이 비활성화된다', async () => {
    setupStores(GROUP_FIXTURE)
    await renderSheet()
    const user = userEvent.setup()

    expect(screen.getByRole('button', { name: '채움' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '없음' }))

    expect(screen.getByRole('button', { name: '채움' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '테두리' })).toBeDisabled()
  })
})

describe('AC-8: draft는 저장 전 미반영, 저장 시 trim 정규화로 정확히 1회 + 닫힘', () => {
  it('편집 중에는 호출 없음, 저장 탭 시 name이 trim되어 1회 호출된다', async () => {
    setupStores({ ...GROUP_FIXTURE, name: null, memo: null, color: null })
    await renderSheet()
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: '그룹 이름' }), ' 윗논 ')
    await user.type(screen.getByRole('textbox', { name: '메모' }), '물길 정비')
    await user.click(screen.getByRole('button', { name: '빨강' }))
    expect(upsertGroupMock).not.toHaveBeenCalled()
    expect(commitGroupDraftMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(upsertGroupMock).toHaveBeenCalledExactlyOnceWith('g1', {
      name: '윗논',
      memo: '물길 정비',
      color: 'c-red',
      style: 'fill',
      parcelIds: ['p1', 'p2'],
    })
    expect(useUiStore.getState().openSheet).toBeNull()
  })

  it('pending이면 저장이 commitGroupDraft로 위임된다', async () => {
    setupStores(
      { name: null, memo: null, color: null, style: 'fill', parcelIds: ['p1', 'p2'] },
      true,
    )
    await renderSheet()
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: '그룹 이름' }), '윗논')
    await user.click(screen.getByRole('button', { name: '파랑' }))
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(commitGroupDraftMock).toHaveBeenCalledExactlyOnceWith({
      name: '윗논',
      memo: null,
      color: 'c-blue',
      style: 'fill',
    })
    expect(upsertGroupMock).not.toHaveBeenCalled()
    expect(useUiStore.getState().openSheet).toBeNull()
  })
})

describe('AC-9: pending 변형 — 해체 자리 라벨 "취소" + "필지 추가" 숨김', () => {
  it('isPending=true면 "취소"가 보이고 "필지 추가"·"그룹 해체"가 없다', async () => {
    setupStores(GROUP_FIXTURE, true)
    await renderSheet()

    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '그룹 해체' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /필지 추가/ })).not.toBeInTheDocument()
  })

  it('isPending=false면 "그룹 해체"와 "필지 추가"가 노출된다', async () => {
    setupStores(GROUP_FIXTURE)
    await renderSheet()

    expect(screen.getByRole('button', { name: '그룹 해체' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /필지 추가/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
  })

  it('pending의 "취소"는 cancelGroupDraft, 비 pending의 "그룹 해체"는 group null 1회다', async () => {
    setupStores(GROUP_FIXTURE, true)
    const { unmount } = await renderSheet()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(cancelGroupDraftMock).toHaveBeenCalledOnce()
    expect(upsertGroupMock).not.toHaveBeenCalled()
    expect(useUiStore.getState().openSheet).toBeNull()

    unmount()
    setupStores(GROUP_FIXTURE)
    await renderSheet()

    await user.click(screen.getByRole('button', { name: '그룹 해체' }))
    expect(upsertGroupMock).toHaveBeenCalledExactlyOnceWith('g1', null)
    expect(useUiStore.getState().openSheet).toBeNull()
  })
})

describe('AC-10: 멤버 제거', () => {
  it('비 pending — 제거 X 탭 시 해당 멤버가 제외된 parcelIds로 즉시 1회 호출된다', async () => {
    setupStores(GROUP_FIXTURE)
    await renderSheet()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '산 123 제거' }))

    expect(upsertGroupMock).toHaveBeenCalledExactlyOnceWith('g1', {
      ...GROUP_FIXTURE,
      parcelIds: ['p2'],
    })
  })

  it('마지막 멤버 제거 시에도 그룹 삭제가 아닌 멤버 0 저장이다', async () => {
    setupStores({ ...GROUP_FIXTURE, parcelIds: ['p1'] })
    await renderSheet()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '산 123 제거' }))

    expect(upsertGroupMock).toHaveBeenCalledExactlyOnceWith('g1', {
      ...GROUP_FIXTURE,
      parcelIds: [],
    })
  })

  it('pending — 제거는 로컬 전용 경로(updateDraftGroupMembers)로만 간다', async () => {
    setupStores(GROUP_FIXTURE, true)
    await renderSheet()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '산 124 제거' }))

    expect(updateDraftGroupMembersMock).toHaveBeenCalledExactlyOnceWith(['p1'])
    expect(upsertGroupMock).not.toHaveBeenCalled()
  })
})
