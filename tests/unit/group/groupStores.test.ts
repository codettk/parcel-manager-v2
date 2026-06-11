import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../src/lib/api'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { Group } from '../../../src/types/api/tabState'

// 명세: docs/specs/group-management.md — AC-1~AC-6 (스토어·트랜잭션 단위 테스트)
vi.mock('../../../src/lib/api', () => ({
  api: { tabState: { upsertGroup: vi.fn() } },
}))

const GROUP_G: Group = {
  name: 'G',
  memo: null,
  color: 'sun',
  style: 'fill',
  parcelIds: ['p2', 'p3'],
}

const GROUP_H: Group = {
  name: 'H',
  memo: null,
  color: null,
  style: 'fill',
  parcelIds: ['p9'],
}

function setupStores(groups: Record<string, Group>) {
  useWorkspaceStore.setState({ activeTabId: 'tab_a', groups })
  useUiStore.getState().setInitializing(false)
}

function tap(parcelId: string | null) {
  useUiStore.getState().tapParcel(parcelId)
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
  vi.clearAllMocks()
  vi.mocked(api.tabState.upsertGroup).mockResolvedValue({ ok: true })
})

describe('AC-1: 멀티선택 모드 탭 토글', () => {
  it('비그룹 필지는 개별 토글, 그룹 소속 필지는 그룹 전체 토글, 빈 곳은 무시된다', () => {
    setupStores({ g1: GROUP_G })
    useUiStore.getState().toggleMultiSelectMode()
    expect(useUiStore.getState().multiSelectMode).toBe(true)

    // 비그룹 필지 개별 추가/제거
    tap('p1')
    expect(useUiStore.getState().multiSelectedIds).toEqual(['p1'])
    tap('p1')
    expect(useUiStore.getState().multiSelectedIds).toEqual([])

    // 그룹(p2,p3) 소속 필지 탭 → 멤버 전체 추가
    tap('p2')
    expect(useUiStore.getState().multiSelectedIds).toEqual(['p2', 'p3'])

    // 전원 선택 상태에서 다시 탭 → 전체 제거
    tap('p3')
    expect(useUiStore.getState().multiSelectedIds).toEqual([])

    // 일부만 선택된 상태에서 그룹 필지 탭 → 합집합 (중복 없음)
    tap('p1')
    tap('p2')
    expect(useUiStore.getState().multiSelectedIds).toEqual(['p1', 'p2', 'p3'])

    // 빈 곳 탭(null)은 선택을 바꾸지 않는다
    tap(null)
    expect(useUiStore.getState().multiSelectedIds).toEqual(['p1', 'p2', 'p3'])
    expect(useUiStore.getState().multiSelectMode).toBe(true)

    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
  })

  it('토글 재탭(취소) 시 모드 종료 + 선택이 비워진다', () => {
    setupStores({})
    useUiStore.getState().toggleMultiSelectMode()
    tap('p1')
    useUiStore.getState().toggleMultiSelectMode()

    expect(useUiStore.getState().multiSelectMode).toBe(false)
    expect(useUiStore.getState().multiSelectedIds).toEqual([])
  })
})

describe('AC-2: beginGroupDraft — 드래프트 트랜잭션 시작 (서버 0회)', () => {
  it('신규 그룹 로컬 추가 + 영향 그룹 스냅샷/삭제 + 멀티선택 종료 + 그룹 시트 열림', () => {
    setupStores({ g1: GROUP_G })
    useUiStore.getState().toggleMultiSelectMode()
    tap('p1')
    tap('p2') // 그룹 전체 토글 → p1,p2,p3

    useWorkspaceStore.getState().beginGroupDraft(useUiStore.getState().multiSelectedIds)

    const ws = useWorkspaceStore.getState()
    expect(ws.pendingGroupCreate).not.toBeNull()
    const newId = ws.pendingGroupCreate?.groupId ?? ''
    expect(newId).toMatch(/^grp_[0-9a-z]+$/)
    // 신규 그룹: 선택 필지 전체 + 기본값
    expect(ws.groups[newId]).toEqual({
      name: null,
      memo: null,
      color: null,
      style: 'fill',
      parcelIds: ['p1', 'p2', 'p3'],
    })
    // 영향 그룹 G는 멤버를 전부 빼앗겨 로컬 삭제 + 원본 스냅샷 보관
    expect(ws.groups).not.toHaveProperty('g1')
    expect(ws.pendingGroupCreate?.originalAffectedGroups).toEqual({ g1: GROUP_G })

    // 멀티선택 종료 + 신규 그룹 선택 + 시트 열림
    const ui = useUiStore.getState()
    expect(ui.multiSelectMode).toBe(false)
    expect(ui.multiSelectedIds).toEqual([])
    expect(ui.selectedGroupId).toBe(newId)
    expect(ui.selectedParcelId).toBeNull()
    expect(ui.openSheet).toBe('group')

    // 서버 호출 0회
    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
  })

  it('일부 멤버만 빼앗기면 영향 그룹은 잔여 멤버로 로컬 갱신된다', () => {
    setupStores({ g1: GROUP_G })

    useWorkspaceStore.getState().beginGroupDraft(['p1', 'p2'])

    const ws = useWorkspaceStore.getState()
    expect(ws.groups['g1']).toEqual({ ...GROUP_G, parcelIds: ['p3'] })
    expect(ws.pendingGroupCreate?.originalAffectedGroups).toEqual({ g1: GROUP_G })
    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
  })

  it('선택이 2개 미만이면 아무 일도 일어나지 않는다', () => {
    setupStores({ g1: GROUP_G })

    useWorkspaceStore.getState().beginGroupDraft(['p1'])

    expect(useWorkspaceStore.getState().pendingGroupCreate).toBeNull()
    expect(useWorkspaceStore.getState().groups).toEqual({ g1: GROUP_G })
    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
  })
})

describe('AC-3: cancelGroupDraft — 원복 (서버 0회)', () => {
  it('신규 그룹 제거 + 영향 그룹 원본 복원', () => {
    setupStores({ g1: GROUP_G })
    useWorkspaceStore.getState().beginGroupDraft(['p1', 'p2', 'p3'])
    const newId = useWorkspaceStore.getState().pendingGroupCreate?.groupId ?? ''

    useWorkspaceStore.getState().cancelGroupDraft()

    const ws = useWorkspaceStore.getState()
    expect(ws.groups).not.toHaveProperty(newId)
    expect(ws.groups['g1']).toEqual(GROUP_G)
    expect(ws.pendingGroupCreate).toBeNull()
    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
  })
})

describe('AC-4: commitGroupDraft — 영향 그룹 null 먼저, 신규 그룹 나중 전송', () => {
  it('각 1회 전송 + pending 해제 + 로컬 그룹에 draft 반영', () => {
    setupStores({ g1: GROUP_G })
    useWorkspaceStore.getState().beginGroupDraft(['p1', 'p2', 'p3'])
    const newId = useWorkspaceStore.getState().pendingGroupCreate?.groupId ?? ''

    useWorkspaceStore
      .getState()
      .commitGroupDraft({ name: '윗논', memo: null, color: 'eco', style: 'border' })

    const finalGroup: Group = {
      name: '윗논',
      memo: null,
      color: 'eco',
      style: 'border',
      parcelIds: ['p1', 'p2', 'p3'],
    }
    expect(vi.mocked(api.tabState.upsertGroup).mock.calls).toEqual([
      ['tab_a', { groupId: 'g1', group: null }], // 영향 그룹: 로컬에서 삭제됐으므로 null
      ['tab_a', { groupId: newId, group: finalGroup }],
    ])
    expect(useWorkspaceStore.getState().pendingGroupCreate).toBeNull()
    expect(useWorkspaceStore.getState().groups[newId]).toEqual(finalGroup)
  })

  it('영향 그룹에 멤버가 남았으면 잔여 멤버 상태로 전송된다', () => {
    setupStores({ g1: GROUP_G })
    useWorkspaceStore.getState().beginGroupDraft(['p1', 'p2'])
    const newId = useWorkspaceStore.getState().pendingGroupCreate?.groupId ?? ''

    useWorkspaceStore
      .getState()
      .commitGroupDraft({ name: null, memo: null, color: null, style: 'fill' })

    expect(vi.mocked(api.tabState.upsertGroup).mock.calls).toEqual([
      ['tab_a', { groupId: 'g1', group: { ...GROUP_G, parcelIds: ['p3'] } }],
      [
        'tab_a',
        {
          groupId: newId,
          group: { name: null, memo: null, color: null, style: 'fill', parcelIds: ['p1', 'p2'] },
        },
      ],
    ])
  })
})

describe('AC-5: 추가모드 — 탭마다 즉시 upsertGroup, 타 그룹 소속 무시', () => {
  it('비멤버 추가·멤버 제거는 각 1회 전송, 타 그룹 소속·빈 곳은 전송 없음', () => {
    setupStores({ g1: GROUP_G, g2: GROUP_H })
    useUiStore.getState().enterAddToGroupMode('g1')
    expect(useUiStore.getState().addToGroupModeGroupId).toBe('g1')
    expect(useUiStore.getState().openSheet).toBeNull()

    // 비멤버 탭 → 추가로 즉시 1회 전송
    tap('p1')
    expect(api.tabState.upsertGroup).toHaveBeenCalledExactlyOnceWith('tab_a', {
      groupId: 'g1',
      group: { ...GROUP_G, parcelIds: ['p2', 'p3', 'p1'] },
    })
    expect(useWorkspaceStore.getState().groups['g1']?.parcelIds).toEqual(['p2', 'p3', 'p1'])

    // 멤버 탭 → 제거로 1회 전송
    tap('p2')
    expect(api.tabState.upsertGroup).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.tabState.upsertGroup).mock.calls[1]).toEqual([
      'tab_a',
      { groupId: 'g1', group: { ...GROUP_G, parcelIds: ['p3', 'p1'] } },
    ])

    // 다른 그룹(g2) 소속 필지 탭 → 무시 (전송 없음)
    tap('p9')
    expect(api.tabState.upsertGroup).toHaveBeenCalledTimes(2)

    // 빈 곳 탭 → 무시
    tap(null)
    expect(api.tabState.upsertGroup).toHaveBeenCalledTimes(2)
    expect(useUiStore.getState().addToGroupModeGroupId).toBe('g1')
  })

  it('완료 시 추가모드 해제 + 해당 그룹 시트 복귀', () => {
    setupStores({ g1: GROUP_G })
    useUiStore.getState().enterAddToGroupMode('g1')

    useUiStore.getState().finishAddToGroupMode()

    const ui = useUiStore.getState()
    expect(ui.addToGroupModeGroupId).toBeNull()
    expect(ui.selectedGroupId).toBe('g1')
    expect(ui.openSheet).toBe('group')
  })
})

describe('AC-6: 일반 모드 탭 분기', () => {
  it('그룹 소속 필지 탭 → 그룹 선택 + 그룹 시트, 비소속 필지 탭 → 필지 시트 유지', () => {
    setupStores({ g1: GROUP_G })

    tap('p2')
    let ui = useUiStore.getState()
    expect(ui.selectedGroupId).toBe('g1')
    expect(ui.openSheet).toBe('group')
    expect(ui.selectedParcelId).toBeNull()

    tap('p1')
    ui = useUiStore.getState()
    expect(ui.selectedParcelId).toBe('p1')
    expect(ui.selectedGroupId).toBeNull()
    expect(ui.openSheet).toBe('parcel')

    tap(null)
    ui = useUiStore.getState()
    expect(ui.selectedParcelId).toBeNull()
    expect(ui.selectedGroupId).toBeNull()
    expect(ui.openSheet).toBeNull()
  })

  it('closeSheet — pending 드래프트 중 닫기는 원복과 동일 (명세 ② 취소 트리거)', () => {
    setupStores({ g1: GROUP_G })
    useWorkspaceStore.getState().beginGroupDraft(['p1', 'p2', 'p3'])
    const newId = useWorkspaceStore.getState().pendingGroupCreate?.groupId ?? ''

    useUiStore.getState().closeSheet()

    expect(useWorkspaceStore.getState().pendingGroupCreate).toBeNull()
    expect(useWorkspaceStore.getState().groups).not.toHaveProperty(newId)
    expect(useWorkspaceStore.getState().groups['g1']).toEqual(GROUP_G)
    expect(useUiStore.getState().openSheet).toBeNull()
    expect(useUiStore.getState().selectedGroupId).toBeNull()
    expect(api.tabState.upsertGroup).not.toHaveBeenCalled()
  })
})
