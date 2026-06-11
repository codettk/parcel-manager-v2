import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParcelSheet } from '../../../src/features/parcel/ParcelSheet'
import { api } from '../../../src/lib/api'
import { AREA_UNIT_STORAGE_KEY, useUiStore } from '../../../src/stores/ui'
import { useWorkspaceStore } from '../../../src/stores/workspace'
import type { Parcel } from '../../../src/types/api/parcels'
import type { ParcelOverride } from '../../../src/types/api/tabState'

// 명세: docs/specs/parcel-sheet.md — AC-1~AC-7 (컴포넌트 테스트). AC-8~10은 E2E(tester) 소관.
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

const PARCEL_FIXTURE: Parcel = {
  localId: 'p1',
  pnu: '4157033026101280004',
  jibun: '128-4',
  jibunFull: '경기도 김포시 월곶면 보구곶리 128-4',
  ldCode: null,
  ldCodeNm: null,
  lndcgrCode: '02',
  lndcgrCodeNm: '답',
  lndpclAr: 1000,
  posesnSeCode: null,
  posesnSeCodeNm: '개인',
  cnrsPsnCo: 3,
  regstrSeCode: null,
  regstrSeCodeNm: null,
  coordinates: [],
  vworldFetchedAt: null,
}

const COLORS_FIXTURE = [
  { colorId: 'c-red', label: '빨강', hex: '#FF0000', sortOrder: 0 },
  { colorId: 'c-blue', label: '파랑', hex: '#0000FF', sortOrder: 1 },
]

const EMPTY_OVERRIDE: ParcelOverride = {
  color: null,
  style: null,
  name: null,
  memo: null,
  pinned: false,
  icon: null,
}

let upsertParcelMock: Mock

function setupStores(overrides: Record<string, ParcelOverride>) {
  useWorkspaceStore.setState({
    colorLabels: COLORS_FIXTURE,
    overrides,
    upsertParcel: upsertParcelMock,
  })
  useUiStore.setState({ isInitializing: false, openSheet: 'parcel', selectedParcelId: 'p1' })
}

/** 렌더 후 면적 행 출현까지 대기 — api.parcels.get 비동기 setState를 act 안에서 소화한다 */
async function renderSheet(parcelId = 'p1') {
  const view = render(<ParcelSheet parcelId={parcelId} />)
  await screen.findByText('1,000 ㎡')
  return view
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  useUiStore.setState(useUiStore.getInitialState(), true)
  localStorage.clear()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  stubMatchMedia()
  upsertParcelMock = vi.fn()
  vi.mocked(api.parcels.get).mockResolvedValue(PARCEL_FIXTURE)
})

describe('AC-1: 기존 override로 draft 초기화 + 색상 스와치 전수 렌더', () => {
  it('이름·메모·색·표시방식·고정·아이콘이 override 값으로 초기화된다', async () => {
    setupStores({
      p1: {
        color: 'c-red',
        style: 'border',
        name: '집앞 논',
        memo: '물꼬 확인',
        pinned: true,
        icon: '🏠',
      },
    })
    await renderSheet()

    expect(screen.getByRole('textbox', { name: '이름' })).toHaveValue('집앞 논')
    expect(screen.getByRole('textbox', { name: '메모' })).toHaveValue('물꼬 확인')
    expect(screen.getByRole('button', { name: '빨강' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '테두리' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('switch')).toBeChecked()
    expect(screen.getByRole('button', { name: '🏠' })).toHaveAttribute('aria-pressed', 'true')

    // "없음" 포함 colorLabels 전 색상 스와치
    expect(screen.getByRole('button', { name: '없음' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '파랑' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByTestId('color-swatch')).toHaveLength(COLORS_FIXTURE.length)
  })
})

describe('AC-2: draft는 저장 전 미반영, X 닫기 = 폐기', () => {
  it('편집 중에는 upsertParcel이 호출되지 않고, X 닫기 시 호출 없이 시트가 닫힌다', async () => {
    setupStores({})
    await renderSheet()
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: '이름' }), '새 이름')
    await user.type(screen.getByRole('textbox', { name: '메모' }), '새 메모')
    await user.click(screen.getByRole('button', { name: '빨강' }))
    await user.click(screen.getByRole('switch'))
    expect(upsertParcelMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(upsertParcelMock).not.toHaveBeenCalled()
    expect(useUiStore.getState().openSheet).toBeNull()
    expect(useUiStore.getState().selectedParcelId).toBeNull()
  })
})

describe('AC-3: 저장 시 정규화된 patch로 1회 호출 + 닫힘', () => {
  it('name trim, pinned=false면 잔존 icon이 null로 정규화된다', async () => {
    setupStores({ p1: { ...EMPTY_OVERRIDE, icon: '🏠' } }) // pinned 꺼짐 + icon 잔존
    await renderSheet()
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: '이름' }), ' 집앞 논 ')
    await user.click(screen.getByRole('button', { name: '빨강' }))
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(upsertParcelMock).toHaveBeenCalledExactlyOnceWith('p1', {
      name: '집앞 논',
      memo: null,
      color: 'c-red',
      style: 'fill',
      pinned: false,
      icon: null,
    })
    expect(useUiStore.getState().openSheet).toBeNull()
  })

  it('색상을 "없음"으로 저장하면 style: null이 포함된다', async () => {
    setupStores({ p1: { ...EMPTY_OVERRIDE, color: 'c-red', style: 'fill' } })
    await renderSheet()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '없음' }))
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(upsertParcelMock).toHaveBeenCalledExactlyOnceWith('p1', {
      name: null,
      memo: null,
      color: null,
      style: null,
      pinned: false,
      icon: null,
    })
  })
})

describe('AC-4: 표시 방식은 색상 없으면 비활성', () => {
  it('color=null이면 비활성, 색상 선택 시 활성화되어 전환 가능하다', async () => {
    setupStores({})
    await renderSheet()
    const user = userEvent.setup()

    expect(screen.getByRole('button', { name: '채움' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '테두리' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '빨강' }))
    expect(screen.getByRole('button', { name: '테두리' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '테두리' }))
    expect(screen.getByRole('button', { name: '테두리' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '채움' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('AC-5: 고정 스위치와 아이콘 팔레트', () => {
  it('스위치 켬 → 팔레트 노출·아이콘 토글, 스위치 끔 → 팔레트 소멸 + icon 제거', async () => {
    setupStores({})
    await renderSheet()
    const user = userEvent.setup()

    // 꺼짐 상태: 팔레트 없음
    expect(screen.queryByText('집·건물')).not.toBeInTheDocument()

    await user.click(screen.getByRole('switch'))
    expect(screen.getByText('집·건물')).toBeInTheDocument()
    expect(screen.getByText('농기계')).toBeInTheDocument()
    expect(screen.getByText('수자원')).toBeInTheDocument()
    expect(screen.getByText('작물')).toBeInTheDocument()
    expect(screen.getByText('기타')).toBeInTheDocument()

    // 아이콘 탭 → 선택, 같은 아이콘 재탭 → 해제
    await user.click(screen.getByRole('button', { name: '🚜' }))
    expect(screen.getByRole('button', { name: '🚜' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '🚜' }))
    expect(screen.getByRole('button', { name: '🚜' })).toHaveAttribute('aria-pressed', 'false')

    // 선택해 두고 스위치 끔 → 팔레트 소멸 + draft.icon 제거 (다시 켜도 해제 상태)
    await user.click(screen.getByRole('button', { name: '🚜' }))
    await user.click(screen.getByRole('switch'))
    expect(screen.queryByText('집·건물')).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch'))
    expect(screen.getByRole('button', { name: '🚜' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('AC-6: 필지 전환 시 draft 리셋', () => {
  it('대상 id가 바뀌면 편집분이 폐기되고 새 필지 override로 리셋된다', async () => {
    setupStores({
      p1: { ...EMPTY_OVERRIDE, name: '논1' },
      p2: { ...EMPTY_OVERRIDE, name: '논2', color: 'c-blue', style: 'fill' },
    })
    const { rerender } = await renderSheet('p1')
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: '이름' }), ' 편집중')
    expect(screen.getByRole('textbox', { name: '이름' })).toHaveValue('논1 편집중')

    rerender(<ParcelSheet parcelId="p2" />)
    await screen.findByText('1,000 ㎡') // p2 정보 재조회 완료까지 대기 (act 경고 방지)

    expect(screen.getByRole('textbox', { name: '이름' })).toHaveValue('논2')
    expect(screen.getByRole('button', { name: '파랑' })).toHaveAttribute('aria-pressed', 'true')
    expect(upsertParcelMock).not.toHaveBeenCalled()
  })
})

describe('AC-7: 면적 단위 토글은 즉시 전역 반영', () => {
  it('"평" 선택 시 저장 버튼 없이 표기가 즉시 바뀌고 localStorage에 영속된다', async () => {
    setupStores({})
    await renderSheet()
    const user = userEvent.setup()

    expect(screen.getByText('1,000 ㎡')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '평' }))

    expect(screen.getByText('302.5 평')).toBeInTheDocument()
    expect(screen.queryByText('1,000 ㎡')).not.toBeInTheDocument()
    expect(useUiStore.getState().areaUnit).toBe('pyeong')
    expect(localStorage.getItem(AREA_UNIT_STORAGE_KEY)).toBe('pyeong')
    expect(upsertParcelMock).not.toHaveBeenCalled() // draft가 아님 — 전역 설정
  })

  it('면적 조회 실패 시 면적 행이 생략된다 (명세 §시트 내용 2)', async () => {
    setupStores({})
    vi.mocked(api.parcels.get).mockRejectedValue(new Error('404'))
    render(<ParcelSheet parcelId="p1" />)

    // 실패가 소화될 때까지 대기 — 면적 행·토지 정보 카드 모두 생략
    await vi.waitFor(() => expect(api.parcels.get).toHaveBeenCalled())
    expect(screen.queryByText('1,000 ㎡')).not.toBeInTheDocument()
    expect(screen.queryByText('지목')).not.toBeInTheDocument()
    // 편집·저장은 계속 가능
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  })
})

describe('토지 정보 카드 (명세 §시트 내용 3)', () => {
  it('pnu가 있으면 지목·소유구분·공유인수(>1)가 표시된다', async () => {
    setupStores({})
    await renderSheet()

    expect(screen.getByText('지목')).toBeInTheDocument()
    expect(screen.getByText('답')).toBeInTheDocument()
    expect(screen.getByText('소유구분')).toBeInTheDocument()
    expect(screen.getByText('개인')).toBeInTheDocument()
    expect(screen.getByText('공유인수')).toBeInTheDocument()
    expect(screen.getByText('3명')).toBeInTheDocument()
  })

  it('cnrsPsnCo가 1이면 공유인수 행이 생략된다', async () => {
    setupStores({})
    vi.mocked(api.parcels.get).mockResolvedValue({ ...PARCEL_FIXTURE, cnrsPsnCo: 1 })
    await renderSheet()

    expect(screen.getByText('지목')).toBeInTheDocument()
    expect(screen.queryByText('공유인수')).not.toBeInTheDocument()
  })

  it('이름 입력 중이면 "기본 지번" 보조 표시가 나타난다 (명세 §시트 내용 1)', async () => {
    setupStores({})
    await renderSheet()
    const user = userEvent.setup()

    expect(screen.queryByText(/기본 지번:/)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '이름' })).toHaveAttribute('placeholder', '128-4')

    await user.type(screen.getByRole('textbox', { name: '이름' }), '집앞')
    expect(screen.getByText(/기본 지번:/)).toBeInTheDocument()
    expect(screen.getByText('128-4')).toBeInTheDocument()
  })
})
