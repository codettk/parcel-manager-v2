import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareSheet } from '../../../src/features/share/ShareSheet'
import {
  SHARE_PARSE_ERROR,
  SHARE_VERSION_ERROR,
  shareFileSchema,
} from '../../../src/features/share/shareFile'
import { api } from '../../../src/lib/api'
import { useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { ColorLabel } from '../../../src/types/api/colors'
import type { Group, ParcelOverride } from '../../../src/types/api/tabState'
import type { Tab } from '../../../src/types/api/tabs'

// 명세: docs/specs/share-json.md — AC-4·AC-5·AC-6 (시트 컴포넌트 테스트). AC-7은 E2E(tester) 소관.
vi.mock('../../../src/lib/api', () => ({
  api: {
    tabState: { importState: vi.fn(), get: vi.fn() },
    colors: { put: vi.fn(), list: vi.fn() },
  },
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

function makeOverride(patch: Partial<ParcelOverride> = {}): ParcelOverride {
  return { color: null, style: null, name: null, memo: null, pinned: false, icon: null, ...patch }
}

const TAB: Tab = {
  tabId: 'tab_a',
  name: '1차: 매수/검토',
  sortOrder: 0,
  closedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedBy: null,
  updatedAt: '2026-06-01T00:00:00.000Z',
}

const LOCAL_COLORS: ColorLabel[] = [
  { colorId: 'eco', label: '매수 예정', hex: '#6CA945', sortOrder: 0 },
  { colorId: 'sun', label: '매수 완료', hex: '#D9A441', sortOrder: 1 },
]

const LOCAL_GROUP: Group = {
  name: '1구역',
  memo: null,
  color: 'eco',
  style: 'fill',
  parcelIds: ['p1', 'p2'],
}

/** 유효한 version 2 파일 (AC-6: 필지 2·그룹 1·색 2) */
const IMPORT_FILE = {
  version: 2,
  tabId: 'tab_origin',
  exportedAt: '2026-06-12T00:30:00.000Z',
  overrides: {
    f1: makeOverride({ color: 'sky', style: 'fill' }),
    f2: makeOverride({ name: '남측 논' }),
  },
  groups: {
    g_file: { name: '파일 구역', memo: null, color: 'sky', style: 'border', parcelIds: ['f1'] },
  },
  colors: [
    { colorId: 'eco', label: '계약 완료', hex: '#112233', sortOrder: 0 },
    { colorId: 'sky', label: '임차', hex: '#5B8FB9', sortOrder: 2 },
  ],
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText('JSON 파일 선택') as HTMLInputElement
}

function selectFile(content: string, name = 'share.json') {
  const file = new File([content], name, { type: 'application/json' })
  fireEvent.change(fileInput(), { target: { files: [file] } })
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  stubMatchMedia()
  useWorkspaceStore.setState({
    activeTabId: 'tab_a',
    tabs: [TAB],
    overrides: {
      p1: makeOverride({ color: 'eco', style: 'fill' }),
      p2: makeOverride({ color: 'sun', style: 'border' }),
      p3: makeOverride({ memo: '메모만' }),
    },
    groups: { g_local: LOCAL_GROUP },
    colorLabels: LOCAL_COLORS,
  })
  useUiStore.getState().openShare()
})

describe('AC-4: 통계 표시 + 내보내기 다운로드', () => {
  let capturedBlob: Blob | null
  let downloadName: string

  beforeEach(() => {
    capturedBlob = null
    downloadName = ''
    // jsdom에는 createObjectURL이 없어 직접 부착
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn((blob: Blob) => {
        capturedBlob = blob
        return 'blob:mock'
      }),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download
    })
  })

  it('통계에 필지 3·그룹 1이 표시된다', () => {
    render(<ShareSheet />)

    expect(screen.getByText('지정 지번')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('그룹')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('내보내기 파일명이 불가 문자 치환 + 오늘 날짜 패턴이고 Blob 내용이 스키마를 통과한다', async () => {
    render(<ShareSheet />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'JSON 내보내기' }))

    const today = new Date().toISOString().slice(0, 10)
    expect(downloadName).toBe(`보구곶리_1차_ 매수_검토_${today}.json`)

    expect(capturedBlob).not.toBeNull()
    const payload: unknown = JSON.parse(await capturedBlob!.text())
    const parsed = shareFileSchema.parse(payload)
    expect(parsed.tabId).toBe('tab_a')
    expect(Object.keys(parsed.overrides)).toHaveLength(3)
    expect(parsed.groups).toEqual({ g_local: LOCAL_GROUP })
    expect(parsed.colors).toEqual(LOCAL_COLORS)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })
})

describe('AC-5: 검증 실패 인라인 오류 + API 미호출 + input 초기화', () => {
  it('비JSON 텍스트는 일반 오류, version 1 파일은 버전 안내를 표시하고 API를 호출하지 않는다', async () => {
    render(<ShareSheet />)

    selectFile('not json {', 'bad.txt')
    expect(await screen.findByText(SHARE_PARSE_ERROR)).toBeInTheDocument()

    selectFile(JSON.stringify({ version: 1, colors: [], parcels: {}, groups: {} }), 'v1.json')
    expect(await screen.findByText(SHARE_VERSION_ERROR)).toBeInTheDocument()
    expect(screen.queryByText(SHARE_PARSE_ERROR)).not.toBeInTheDocument()

    expect(api.tabState.importState).not.toHaveBeenCalled()
    expect(api.colors.put).not.toHaveBeenCalled()
    // 선택 직후 value 초기화 — 같은 파일 재선택에도 브라우저 change가 재발화하는 근거
    expect(fileInput().value).toBe('')
  })

  it('같은 파일을 다시 선택해도 onChange 처리가 재발화한다', async () => {
    render(<ShareSheet />)
    const v1Content = JSON.stringify({ version: 1, colors: [], parcels: {}, groups: {} })

    selectFile(v1Content, 'v1.json')
    expect(await screen.findByText(SHARE_VERSION_ERROR)).toBeInTheDocument()

    // 다른 오류로 전환 후 같은 v1 파일 재선택 — 메시지가 다시 버전 안내로 바뀌면 재처리된 것
    selectFile('not json {', 'bad.txt')
    expect(await screen.findByText(SHARE_PARSE_ERROR)).toBeInTheDocument()

    selectFile(v1Content, 'v1.json')
    expect(await screen.findByText(SHARE_VERSION_ERROR)).toBeInTheDocument()
  })
})

describe('AC-6: 미리보기 → 적용/취소', () => {
  beforeEach(() => {
    vi.mocked(api.tabState.importState).mockResolvedValue({ ok: true })
    vi.mocked(api.colors.put).mockResolvedValue({ ok: true })
    // 서버는 group_id를 재생성한다 — 재조회 응답의 키가 파일(g_file)과 다름
    vi.mocked(api.tabState.get).mockResolvedValue({
      overrides: { f1: makeOverride({ color: 'sky', style: 'fill' }) },
      groups: {
        g_regen: {
          name: '파일 구역',
          memo: null,
          color: 'sky',
          style: 'border',
          parcelIds: ['f1'],
        },
      },
    })
    vi.mocked(api.colors.list).mockResolvedValue([
      { colorId: 'eco', label: '계약 완료', hex: '#112233', sortOrder: 0 },
      { colorId: 'sun', label: '매수 완료', hex: '#D9A441', sortOrder: 1 },
      { colorId: 'sky', label: '임차', hex: '#5B8FB9', sortOrder: 2 },
    ])
  })

  it('미리보기에 필지 2개·그룹 1개·색 2개와 교체 경고가 표시되고 아직 API가 호출되지 않는다', async () => {
    render(<ShareSheet />)

    selectFile(JSON.stringify(IMPORT_FILE))

    expect(await screen.findByText('필지 2개')).toBeInTheDocument()
    expect(screen.getByText('그룹 1개')).toBeInTheDocument()
    expect(screen.getByText('색 2개')).toBeInTheDocument()
    expect(screen.getByText(/현재 탭의 필지 설정과 그룹이 모두 교체되고/)).toBeInTheDocument()
    expect(screen.getByText(/팔레트 색 2개는 모든 탭에 반영됩니다/)).toBeInTheDocument()
    expect(api.tabState.importState).not.toHaveBeenCalled()
    expect(api.colors.put).not.toHaveBeenCalled()
    expect(api.tabState.get).not.toHaveBeenCalled()
  })

  it('[적용]은 importState → colors.put(병합) → 재조회 순으로 호출하고 스토어를 재조회 응답으로 갱신한다', async () => {
    render(<ShareSheet />)
    const user = userEvent.setup()

    selectFile(JSON.stringify(IMPORT_FILE))
    await screen.findByText('필지 2개')
    await user.click(screen.getByRole('button', { name: '적용' }))

    await waitFor(() => {
      expect(api.tabState.get).toHaveBeenCalledExactlyOnceWith('tab_a')
    })
    expect(api.tabState.importState).toHaveBeenCalledExactlyOnceWith('tab_a', {
      overrides: IMPORT_FILE.overrides,
      groups: IMPORT_FILE.groups,
    })
    // upsert 병합 — eco는 파일 값, sun(기존 전용)은 보존, sky는 추가
    expect(api.colors.put).toHaveBeenCalledExactlyOnceWith({
      colors: [
        { colorId: 'eco', label: '계약 완료', hex: '#112233', sortOrder: 0 },
        { colorId: 'sun', label: '매수 완료', hex: '#D9A441', sortOrder: 1 },
        { colorId: 'sky', label: '임차', hex: '#5B8FB9', sortOrder: 2 },
      ],
    })
    const importOrder = vi.mocked(api.tabState.importState).mock.invocationCallOrder[0]
    const putOrder = vi.mocked(api.colors.put).mock.invocationCallOrder[0]
    const refetchOrder = vi.mocked(api.tabState.get).mock.invocationCallOrder[0]
    expect(importOrder).toBeLessThan(putOrder)
    expect(putOrder).toBeLessThan(refetchOrder)

    // 스토어는 파일이 아닌 재조회 응답으로 갱신 — 서버가 재생성한 그룹 키(g_regen)
    const ws = useWorkspaceStore.getState()
    expect(Object.keys(ws.groups)).toEqual(['g_regen'])
    expect(Object.keys(ws.overrides)).toEqual(['f1'])
    expect(ws.colorLabels).toHaveLength(3)

    // 적용 완료 — 미리보기 해제 + 성공 표시
    expect(screen.queryByText('필지 2개')).not.toBeInTheDocument()
    expect(screen.getByText(/불러오기를 적용했습니다/)).toBeInTheDocument()
  })

  it('[취소]는 API 호출 없이 미리보기를 닫는다', async () => {
    render(<ShareSheet />)
    const user = userEvent.setup()

    selectFile(JSON.stringify(IMPORT_FILE))
    await screen.findByText('필지 2개')
    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(screen.queryByText('필지 2개')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JSON 내보내기' })).toBeInTheDocument()
    expect(api.tabState.importState).not.toHaveBeenCalled()
    expect(api.colors.put).not.toHaveBeenCalled()
    expect(api.tabState.get).not.toHaveBeenCalled()
  })
})
