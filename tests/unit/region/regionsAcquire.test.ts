import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// 명세: docs/specs/national-data-pipeline.md AC-7·8·9·12·13 — 받기/제거 낙관 업데이트.
import { useRegionsStore } from '../../../src/stores/regions'
import { SEED_CATALOG } from '../../../src/features/region/regionCatalog'

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

const SAMPLE_ID = 'gyeonggi-gimpo-daegot' // SEED_CATALOG에서 loaded:true
const UPCOMING_ID = SEED_CATALOG.find((r) => !r.loaded)!.id

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  localStorage.clear()
  useRegionsStore.setState({
    catalog: [...SEED_CATALOG],
    catalogLoaded: false,
    acquiredIds: [],
    acquiring: null,
  })
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('acquire — 받기 (AC-7·8·12)', () => {
  it('적재 region 받기는 낙관적으로 추가하고 POST 후 true (AC-7·12)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { regionId: SAMPLE_ID, acquiredAt: '2026-06-16T00:00:00.000Z' }),
    )
    const ok = await useRegionsStore.getState().acquire(SAMPLE_ID)
    expect(ok).toBe(true)
    expect(useRegionsStore.getState().acquiredIds).toContain(SAMPLE_ID)
    expect(useRegionsStore.getState().acquiring).toBeNull()
    const call = fetchMock.mock.calls.at(-1)
    expect(String(call?.[0])).toBe(`/api/regions/${SAMPLE_ID}/acquire`)
    expect(call?.[1]?.method).toBe('POST')
  })

  it('받기 진행 중 acquiring 플래그가 낙관적으로 설정된다 (디자인 d "받는 중…")', async () => {
    let resolveFetch: (r: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((res) => {
        resolveFetch = res
      }),
    )
    const p = useRegionsStore.getState().acquire(SAMPLE_ID)
    expect(useRegionsStore.getState().acquiring).toBe(SAMPLE_ID)
    expect(useRegionsStore.getState().acquiredIds).toContain(SAMPLE_ID)
    resolveFetch(jsonResponse(200, { regionId: SAMPLE_ID, acquiredAt: '2026-06-16T00:00:00.000Z' }))
    await p
    expect(useRegionsStore.getState().acquiring).toBeNull()
  })

  it('준비 중(loaded=false) region 받기는 false, 추가/요청 없음 (AC-8·17)', async () => {
    const ok = await useRegionsStore.getState().acquire(UPCOMING_ID)
    expect(ok).toBe(false)
    expect(useRegionsStore.getState().acquiredIds).not.toContain(UPCOMING_ID)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('이미 받은 region은 멱등 — 즉시 true, 요청 없음', async () => {
    useRegionsStore.setState({ acquiredIds: [SAMPLE_ID] })
    const ok = await useRegionsStore.getState().acquire(SAMPLE_ID)
    expect(ok).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('서버 409면 낙관 추가를 되돌리고 false (준비중 서버 판정 방어)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: '준비 중' }))
    const ok = await useRegionsStore.getState().acquire(SAMPLE_ID)
    expect(ok).toBe(false)
    expect(useRegionsStore.getState().acquiredIds).not.toContain(SAMPLE_ID)
  })

  it('서버 500은 낙관 유지(롤백 없음, M-5 패턴)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: '서버 오류' }))
    const ok = await useRegionsStore.getState().acquire(SAMPLE_ID)
    expect(ok).toBe(true)
    expect(useRegionsStore.getState().acquiredIds).toContain(SAMPLE_ID)
  })
})

describe('remove — 제거 (AC-9·13)', () => {
  it('낙관적으로 목록에서 제거하고 DELETE 전송', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    useRegionsStore.setState({ acquiredIds: [SAMPLE_ID, 'other'] })
    useRegionsStore.getState().remove(SAMPLE_ID)
    // 낙관적 제거는 동기 — 전송은 비동기(토큰 제공자 await 후)이므로 마이크로태스크 flush
    expect(useRegionsStore.getState().acquiredIds).toEqual(['other'])
    await Promise.resolve()
    await Promise.resolve()
    const call = fetchMock.mock.calls.at(-1)
    expect(String(call?.[0])).toBe(`/api/regions/${SAMPLE_ID}`)
    expect(call?.[1]?.method).toBe('DELETE')
  })
})

describe('loadMine — 받은 목록 + 활성 region 보강 (AC-16)', () => {
  it('서버 목록을 반영하고 활성 region(localStorage)을 병합한다', async () => {
    localStorage.setItem('pilji_v2_active_region', SAMPLE_ID)
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [{ regionId: 'other-acquired', acquiredAt: '2026-06-16T00:00:00.000Z' }]),
    )
    await useRegionsStore.getState().loadMine()
    expect(useRegionsStore.getState().acquiredIds).toContain('other-acquired')
    expect(useRegionsStore.getState().acquiredIds).toContain(SAMPLE_ID)
  })

  it('서버 실패 시 활성 region을 로컬 폴백으로 보강한다 (절충 4)', async () => {
    localStorage.setItem('pilji_v2_active_region', SAMPLE_ID)
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: '인증 필요' }))
    await useRegionsStore.getState().loadMine()
    expect(useRegionsStore.getState().acquiredIds).toContain(SAMPLE_ID)
  })
})

describe('loadCatalog — 폴백 (절충 4)', () => {
  it('성공 시 서버 카탈로그로 교체', async () => {
    const server = [{ ...SEED_CATALOG[0], displayName: '서버 이름' }]
    fetchMock.mockResolvedValueOnce(jsonResponse(200, server))
    await useRegionsStore.getState().loadCatalog()
    expect(useRegionsStore.getState().catalog[0].displayName).toBe('서버 이름')
    expect(useRegionsStore.getState().catalogLoaded).toBe(true)
  })

  it('실패 시 시드 카탈로그 폴백 유지', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: '오류' }))
    await useRegionsStore.getState().loadCatalog()
    expect(useRegionsStore.getState().catalog.length).toBe(SEED_CATALOG.length)
    expect(useRegionsStore.getState().catalogLoaded).toBe(true)
  })
})
