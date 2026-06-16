import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchLandInfoHandler } from '../../server/handlers/parcels'
import type { HandlerContext } from '../../server/handlers/types'
import { runFetchVworld } from '../../scripts/fetch-vworld'
import { errorResponseSchema } from '../../src/types/api/common'
import { parcelSchema } from '../../src/types/api/parcels'
import { db, pickParcelIds } from './helpers'

const CLIENT_ID = 'itest-vworld'

/** V-World ladfrlList 정상 XML(단일 항목). 빈 문자열 필드 1종 포함 — null 정규화 검증용 */
function ladfrlXml(opts: { lndcgrNm?: string; ar?: string; cnrs?: string } = {}): string {
  const lndcgrNm = opts.lndcgrNm ?? '전'
  const ar = opts.ar ?? '1234.5'
  const cnrs = opts.cnrs ?? '2'
  return `<?xml version="1.0" encoding="UTF-8"?>
<fields>
  <ladfrlVOList>
    <ldCode>4159025021</ldCode>
    <ldCodeNm>경기도 화성시 우정읍</ldCodeNm>
    <lndcgrCode>01</lndcgrCode>
    <lndcgrCodeNm>${lndcgrNm}</lndcgrCodeNm>
    <lndpclAr>${ar}</lndpclAr>
    <posesnSeCode>01</posesnSeCode>
    <posesnSeCodeNm></posesnSeCodeNm>
    <cnrsPsnCo>${cnrs}</cnrsPsnCo>
    <regstrSeCode>1</regstrSeCode>
    <regstrSeCodeNm>토지대장</regstrSeCodeNm>
  </ladfrlVOList>
</fields>`
}

function xmlResponse(xml: string): Response {
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml' } })
}

const PNU = '4159025021' + '10000001' + '0' // 19자리

function ctxWith(env: Record<string, string | undefined>): HandlerContext {
  return { env: { ...process.env, ...env } }
}

const VWORLD_URL = 'https://api.vworld.kr/ned/data/ladfrlList'

// supabase-js도 전역 fetch를 쓰므로 V-World URL만 가로채고 나머지는 실 fetch로 통과시킨다.
// V-World 호출 검증·기대 응답은 vworldMock으로만 한다.
const vworldMock = vi.fn<typeof fetch>()
const realFetch = globalThis.fetch.bind(globalThis)

beforeEach(() => {
  vi.stubGlobal('fetch', ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input) === VWORLD_URL) return vworldMock(input, init)
    return realFetch(input, init)
  }) as typeof fetch)
})

afterEach(async () => {
  vworldMock.mockReset()
  vi.unstubAllGlobals()
  // 테스트가 만진 pnu/vworld_fetched_at 정리 — 다른 통합 테스트 격리
  await db.from('parcels').update({ pnu: null, vworld_fetched_at: null }).not('pnu', 'is', null)
})

async function setPnu(localId: string, pnu: string | null): Promise<void> {
  const { error } = await db
    .from('parcels')
    .update({ pnu, vworld_fetched_at: null })
    .eq('local_id', localId)
  if (error) throw new Error(error.message)
}

describe('AC-1: fetchLandInfoHandler — 정상 조회 시 매핑 갱신·200 parcelSchema', () => {
  it('V-World에 pnu·key 포함 form-urlencoded로 1회 POST하고 행을 매핑 표대로 갱신한다', async () => {
    const [id] = await pickParcelIds(1)
    await setPnu(id, PNU)
    vworldMock.mockResolvedValueOnce(xmlResponse(ladfrlXml()))

    const ctx = ctxWith({ V_WORLD_LADFRLLIST: 'test-key', V_WORLD_DOMAIN: 'example.com' })
    const res = await fetchLandInfoHandler(
      { method: 'POST', params: { id }, query: {}, body: { clientId: CLIENT_ID } },
      ctx,
    )

    expect(res.status).toBe(200)
    const parcel = parcelSchema.parse(res.body)
    expect(parcel.localId).toBe(id)
    expect(parcel.lndcgrCodeNm).toBe('전')
    expect(parcel.lndpclAr).toBe(1234.5)
    expect(parcel.cnrsPsnCo).toBe(2)
    expect(parcel.posesnSeCodeNm).toBeNull() // 빈 문자열 → null
    expect(parcel.regstrSeCodeNm).toBe('토지대장')
    expect(parcel.vworldFetchedAt).not.toBeNull()

    expect(vworldMock).toHaveBeenCalledTimes(1)
    const [url, init] = vworldMock.mock.calls[0]
    expect(String(url)).toBe('https://api.vworld.kr/ned/data/ladfrlList')
    expect(init?.method).toBe('POST')
    const body = String(init?.body)
    expect(body).toContain(`pnu=${PNU}`)
    expect(body).toContain('key=test-key')
    expect(body).toContain('format=xml')
    expect(body).toContain('domain=example.com')
  })
})

describe('AC-2: V_WORLD_LADFRLLIST 미설정 → 503, V-World 미호출', () => {
  it('키 없는 env면 503 errorResponseSchema이고 fetch는 호출되지 않는다', async () => {
    const [id] = await pickParcelIds(1)
    await setPnu(id, PNU)

    const ctx = ctxWith({ V_WORLD_LADFRLLIST: undefined })
    const res = await fetchLandInfoHandler(
      { method: 'POST', params: { id }, query: {}, body: { clientId: CLIENT_ID } },
      ctx,
    )

    expect(res.status).toBe(503)
    errorResponseSchema.parse(res.body)
    expect(vworldMock).not.toHaveBeenCalled()
  })
})

describe('AC-3: 미존재 필지 404 / pnu null 409(미호출)', () => {
  it('존재하지 않는 id에 404를 반환한다', async () => {
    const ctx = ctxWith({ V_WORLD_LADFRLLIST: 'test-key' })
    const res = await fetchLandInfoHandler(
      {
        method: 'POST',
        params: { id: 'no_such_parcel' },
        query: {},
        body: { clientId: CLIENT_ID },
      },
      ctx,
    )
    expect(res.status).toBe(404)
    errorResponseSchema.parse(res.body)
    expect(vworldMock).not.toHaveBeenCalled()
  })

  it('pnu가 null인 필지에 409이고 fetch는 호출되지 않는다', async () => {
    const [id] = await pickParcelIds(1)
    await setPnu(id, null)

    const ctx = ctxWith({ V_WORLD_LADFRLLIST: 'test-key' })
    const res = await fetchLandInfoHandler(
      { method: 'POST', params: { id }, query: {}, body: { clientId: CLIENT_ID } },
      ctx,
    )
    expect(res.status).toBe(409)
    errorResponseSchema.parse(res.body)
    expect(vworldMock).not.toHaveBeenCalled()
  })

  it('pnu가 19자리가 아니면 409다', async () => {
    const [id] = await pickParcelIds(1)
    await setPnu(id, '12345')

    const ctx = ctxWith({ V_WORLD_LADFRLLIST: 'test-key' })
    const res = await fetchLandInfoHandler(
      { method: 'POST', params: { id }, query: {}, body: { clientId: CLIENT_ID } },
      ctx,
    )
    expect(res.status).toBe(409)
    expect(vworldMock).not.toHaveBeenCalled()
  })
})

describe('AC-4: 네트워크/파싱/무자료 실패 모두 502, 행 미변경', () => {
  async function expectBadGateway(mockSetup: () => void): Promise<void> {
    const [id] = await pickParcelIds(1)
    await setPnu(id, PNU)
    mockSetup()

    const ctx = ctxWith({ V_WORLD_LADFRLLIST: 'test-key' })
    const res = await fetchLandInfoHandler(
      { method: 'POST', params: { id }, query: {}, body: { clientId: CLIENT_ID } },
      ctx,
    )
    expect(res.status).toBe(502)
    errorResponseSchema.parse(res.body)

    const { data } = await db
      .from('parcels')
      .select('vworld_fetched_at')
      .eq('local_id', id)
      .single()
    expect((data as { vworld_fetched_at: string | null }).vworld_fetched_at).toBeNull()
  }

  it('fetch reject(네트워크 실패) → 502', async () => {
    await expectBadGateway(() => vworldMock.mockRejectedValueOnce(new Error('ECONNRESET')))
  })

  it('파싱 불가 본문 응답 → 502', async () => {
    // fast-xml-parser는 관대해 대부분 통과하므로, ladfrlVOList 없는 JSON-에러 XML로 무자료 경로를 함께 본다.
    await expectBadGateway(() =>
      vworldMock.mockResolvedValueOnce(xmlResponse('<fields><error>키 오류</error></fields>')),
    )
  })

  it('ladfrlVOList 없는 응답(무자료) → 502', async () => {
    await expectBadGateway(() =>
      vworldMock.mockResolvedValueOnce(xmlResponse('<?xml version="1.0"?><fields></fields>')),
    )
  })
})

describe('AC-5: 일괄 스크립트 runFetchVworld — 멱등·force', () => {
  it('미조회 2건만 조회·갱신하고(멱등), --force면 19자리 3건 모두 호출한다', async () => {
    const ids = await pickParcelIds(4)
    // 3건은 서로 다른 19자리 pnu, 1건은 null
    await setPnu(ids[0], '4159025021100000001')
    await setPnu(ids[1], '4159025021100000002')
    await setPnu(ids[2], '4159025021100000003')
    await setPnu(ids[3], null)
    // ids[2]는 이미 조회 완료로 표시 (멱등 대상 제외)
    {
      const { error } = await db
        .from('parcels')
        .update({ vworld_fetched_at: new Date().toISOString() })
        .eq('local_id', ids[2])
      if (error) throw new Error(error.message)
    }

    // Response 본문은 1회만 읽히므로 매 호출 새 Response를 반환한다
    vworldMock.mockImplementation(() => Promise.resolve(xmlResponse(ladfrlXml())))
    const env = { V_WORLD_LADFRLLIST: 'test-key' }

    // 멱등: 미조회 2건(ids[0], ids[1])만 — null 1건·이미조회 1건 제외
    const r1 = await runFetchVworld(db, env, { delayMs: 0 })
    expect(r1.total).toBe(2)
    expect(r1.success).toBe(2)
    expect(r1.failures).toHaveLength(0)
    expect(vworldMock).toHaveBeenCalledTimes(2)

    // 재실행: 방금 2건이 조회 완료되어 대상 0건 (멱등)
    vworldMock.mockClear()
    const r2 = await runFetchVworld(db, env, { delayMs: 0 })
    expect(r2.total).toBe(0)
    expect(vworldMock).not.toHaveBeenCalled()

    // --force: 19자리 3건 전량 재호출
    vworldMock.mockClear()
    const r3 = await runFetchVworld(db, env, { force: true, delayMs: 0 })
    expect(r3.total).toBe(3)
    expect(vworldMock).toHaveBeenCalledTimes(3)
  })
})
