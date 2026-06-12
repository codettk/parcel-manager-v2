import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../src/lib/api'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { ColorLabel } from '../../../src/types/api/colors'
import type { Group, ParcelOverride } from '../../../src/types/api/tabState'

// 명세: docs/specs/color-palette.md — AC-1·AC-2 (workspace colors mutate, api 모킹)
vi.mock('../../../src/lib/api', () => ({
  api: { colors: { put: vi.fn(), remove: vi.fn() } },
}))

function makeOverride(patch: Partial<ParcelOverride>): ParcelOverride {
  return { color: null, style: null, name: null, memo: null, pinned: false, icon: null, ...patch }
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  vi.clearAllMocks()
  vi.mocked(api.colors.put).mockResolvedValue({ ok: true })
  vi.mocked(api.colors.remove).mockResolvedValue({ ok: true })
})

describe('saveColors() — AC-1', () => {
  it('행 순서대로 sortOrder 0·1·2를 부여해 put 1회 호출 + colorLabels 갱신', () => {
    // 입력 sortOrder는 의도적으로 어긋나게 — 행 인덱스 재부여를 증명
    const input: ColorLabel[] = [
      { colorId: 'a', label: '과수원', hex: '#6ca945', sortOrder: 5 },
      { colorId: 'b', label: '매수 완료', hex: '#d9a441', sortOrder: 0 },
      { colorId: 'c', label: '임차', hex: '#5b8fb9', sortOrder: 2 },
    ]

    useWorkspaceStore.getState().saveColors(input)

    const expected = input.map((c, i) => ({ ...c, sortOrder: i }))
    expect(api.colors.put).toHaveBeenCalledExactlyOnceWith({ colors: expected })
    expect(useWorkspaceStore.getState().colorLabels).toEqual(expected)
  })
})

describe('deleteColorAndCleanup() — AC-2', () => {
  it('remove 호출 + colorLabels 제거 + override/group 낙관적 로컬 정리', () => {
    useWorkspaceStore.setState({
      colorLabels: [
        { colorId: 'c', label: '삭제 대상', hex: '#b96a8c', sortOrder: 0 },
        { colorId: 'other', label: '유지', hex: '#6ca945', sortOrder: 1 },
      ],
      overrides: {
        // ① color=c·style만 — 정리 후 의미 필드가 없어 키 삭제
        p1: makeOverride({ color: 'c', style: 'fill' }),
        // ② color=c·name도 — color/style null, name 보존
        p2: makeOverride({ color: 'c', style: 'border', name: '복숭아밭' }),
        // ③ 다른 색 — 불변
        p3: makeOverride({ color: 'other', style: 'fill' }),
      },
      groups: {
        g1: { name: '그룹1', memo: null, color: 'c', style: 'fill', parcelIds: ['p4', 'p5'] },
        g2: { name: '그룹2', memo: null, color: 'other', style: 'border', parcelIds: ['p6'] },
      },
    })

    useWorkspaceStore.getState().deleteColorAndCleanup('c')

    expect(api.colors.remove).toHaveBeenCalledExactlyOnceWith('c')

    const s = useWorkspaceStore.getState()
    expect(s.colorLabels).toEqual([
      { colorId: 'other', label: '유지', hex: '#6ca945', sortOrder: 1 },
    ])
    expect(s.overrides).not.toHaveProperty('p1')
    expect(s.overrides['p2']).toEqual(makeOverride({ name: '복숭아밭' }))
    expect(s.overrides['p3']).toEqual(makeOverride({ color: 'other', style: 'fill' }))
    const expectedGroups: Record<string, Group> = {
      g1: { name: '그룹1', memo: null, color: null, style: 'fill', parcelIds: ['p4', 'p5'] },
      g2: { name: '그룹2', memo: null, color: 'other', style: 'border', parcelIds: ['p6'] },
    }
    expect(s.groups).toEqual(expectedGroups)
  })
})
