import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// 명세: docs/specs/gps-geocoding.md §GPS 동선 — 상태 머신(권한·매칭·무매칭·에러 분기).
import { useGpsLocate } from '../../../src/features/region/useGpsLocate'
import { SEED_CATALOG, SEED_REGION } from '../../../src/features/region/regionCatalog'

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()
const getCurrentPosition = vi.fn()

const FAKE_COORDS = { coords: { longitude: 126.4, latitude: 37.6 } } as GeolocationPosition

function stubGeolocation(supported: boolean) {
  if (supported) {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
  } else {
    vi.stubGlobal('navigator', {})
  }
}

const UPCOMING = SEED_CATALOG.find((r) => !r.loaded)
if (UPCOMING === undefined) throw new Error('SEED_CATALOG에 준비중 region이 없음 (테스트 전제)')

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  getCurrentPosition.mockReset()
  vi.unstubAllGlobals()
})

describe('useGpsLocate — 상태 머신', () => {
  it('초기 상태는 idle', () => {
    stubGeolocation(true)
    const { result } = renderHook(() => useGpsLocate(SEED_CATALOG))
    expect(result.current.status).toBe('idle')
    expect(result.current.matchedRegion).toBeNull()
  })

  it('locate 호출 시 좌표 대기 동안 locating', () => {
    stubGeolocation(true)
    getCurrentPosition.mockImplementation(() => {
      /* 콜백 미호출 — 대기 상태 유지 */
    })
    const { result } = renderHook(() => useGpsLocate(SEED_CATALOG))
    act(() => result.current.locate())
    expect(result.current.status).toBe('locating')
  })

  it('AC-12 geolocation 미지원이면 unsupported — 역지오코딩 호출 없음', () => {
    stubGeolocation(false)
    const { result } = renderHook(() => useGpsLocate(SEED_CATALOG))
    act(() => result.current.locate())
    expect(result.current.status).toBe('unsupported')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AC-12 권한 거부(error 콜백)면 permission-denied — 역지오코딩 호출 없음 (슬라이스 1 회귀)', () => {
    stubGeolocation(true)
    getCurrentPosition.mockImplementation((_ok, err: PositionErrorCallback) => {
      err({ code: 1 } as GeolocationPositionError)
    })
    const { result } = renderHook(() => useGpsLocate(SEED_CATALOG))
    act(() => result.current.locate())
    expect(result.current.status).toBe('permission-denied')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AC-9 좌표→역지오코딩이 보구곶 행정구역 반환 → matched + 적재 region', async () => {
    stubGeolocation(true)
    getCurrentPosition.mockImplementation((ok: PositionCallback) => ok(FAKE_COORDS))
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { area: { sido: '인천광역시', sigungu: '강화군', emd: '화도면' } }),
    )
    const { result } = renderHook(() => useGpsLocate(SEED_CATALOG))
    act(() => result.current.locate())
    await waitFor(() => expect(result.current.status).toBe('matched'))
    expect(result.current.matchedRegion?.id).toBe(SEED_REGION.id)
    expect(result.current.matchedRegion?.loaded).toBe(true)
    // POST /api/geocode/reverse — 좌표 본문 전송(clientId 없음)
    const call = fetchMock.mock.calls.at(-1)
    expect(String(call?.[0])).toBe('/api/geocode/reverse')
    expect(call?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ lng: 126.4, lat: 37.6 })
  })

  it('AC-10 매칭된 region이 준비중(loaded=false)이면 matched + region.loaded=false', async () => {
    stubGeolocation(true)
    getCurrentPosition.mockImplementation((ok: PositionCallback) => ok(FAKE_COORDS))
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        area: { sido: UPCOMING.sido, sigungu: UPCOMING.sigungu, emd: UPCOMING.emd },
      }),
    )
    const { result } = renderHook(() => useGpsLocate(SEED_CATALOG))
    act(() => result.current.locate())
    await waitFor(() => expect(result.current.status).toBe('matched'))
    expect(result.current.matchedRegion?.id).toBe(UPCOMING.id)
    expect(result.current.matchedRegion?.loaded).toBe(false)
  })

  it('AC-11 카탈로그 무매칭 행정구역이면 no-match — matchedRegion null(보구곶 자동 추천 없음)', async () => {
    stubGeolocation(true)
    getCurrentPosition.mockImplementation((ok: PositionCallback) => ok(FAKE_COORDS))
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { area: { sido: '서울특별시', sigungu: '종로구', emd: '청운동' } }),
    )
    const { result } = renderHook(() => useGpsLocate(SEED_CATALOG))
    act(() => result.current.locate())
    await waitFor(() => expect(result.current.status).toBe('no-match'))
    expect(result.current.matchedRegion).toBeNull()
  })

  it('AC-5/11 area=null(행정구역 미확정)이면 no-match', async () => {
    stubGeolocation(true)
    getCurrentPosition.mockImplementation((ok: PositionCallback) => ok(FAKE_COORDS))
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { area: null }))
    const { result } = renderHook(() => useGpsLocate(SEED_CATALOG))
    act(() => result.current.locate())
    await waitFor(() => expect(result.current.status).toBe('no-match'))
    expect(result.current.matchedRegion).toBeNull()
  })

  it('AC-13 역지오코딩 503(키 부재)이면 geocode-error — 검색 폴백', async () => {
    stubGeolocation(true)
    getCurrentPosition.mockImplementation((ok: PositionCallback) => ok(FAKE_COORDS))
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: '키 미설정' }))
    const { result } = renderHook(() => useGpsLocate(SEED_CATALOG))
    act(() => result.current.locate())
    await waitFor(() => expect(result.current.status).toBe('geocode-error'))
    expect(result.current.matchedRegion).toBeNull()
  })

  it('AC-13 역지오코딩 502(외부 실패)이면 geocode-error', async () => {
    stubGeolocation(true)
    getCurrentPosition.mockImplementation((ok: PositionCallback) => ok(FAKE_COORDS))
    fetchMock.mockResolvedValueOnce(jsonResponse(502, { error: '외부 게이트웨이 실패' }))
    const { result } = renderHook(() => useGpsLocate(SEED_CATALOG))
    act(() => result.current.locate())
    await waitFor(() => expect(result.current.status).toBe('geocode-error'))
  })

  it('reset은 idle로 되돌리고 matchedRegion을 비운다', async () => {
    stubGeolocation(true)
    getCurrentPosition.mockImplementation((ok: PositionCallback) => ok(FAKE_COORDS))
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { area: { sido: '인천광역시', sigungu: '강화군', emd: '화도면' } }),
    )
    const { result } = renderHook(() => useGpsLocate(SEED_CATALOG))
    act(() => result.current.locate())
    await waitFor(() => expect(result.current.status).toBe('matched'))
    act(() => result.current.reset())
    expect(result.current.status).toBe('idle')
    expect(result.current.matchedRegion).toBeNull()
  })
})
