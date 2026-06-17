import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { reverseGeocodeHandler } from '../../server/handlers/geocode'
import type { HandlerContext } from '../../server/handlers/types'
import { errorResponseSchema } from '../../src/types/api/common'
import { reverseGeocodeResponseSchema } from '../../src/types/api/geocode'
import { getTestToken } from './helpers'

// 역지오코딩도 requireUser mutate 게이트라 유효 세션 토큰이 필요하다(AC-4 반례는 토큰 미주입).
let authToken = ''

// 보구곶 인근 좌표(인천 강화군 화도면) — 외부 호출 파라미터로만 쓰이고 응답에 에코되지 않는다.
const LNG = 126.41
const LAT = 37.6

/** V-World getAddress(PARCEL) 정상 XML — structure.level1/2/4L = 시도/시군구/읍면동 */
function addressXml(opts: { level1?: string; level2?: string; level4L?: string } = {}): string {
  const level1 = opts.level1 ?? '인천광역시'
  const level2 = opts.level2 ?? '강화군'
  const level4L = opts.level4L ?? '화도면'
  return `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <status>OK</status>
  <result>
    <type>parcel</type>
    <structure>
      <level0>대한민국</level0>
      <level1>${level1}</level1>
      <level2>${level2}</level2>
      <level3></level3>
      <level4L>${level4L}</level4L>
      <level4LC>2871025300</level4LC>
    </structure>
  </result>
</response>`
}

/** 좌표에 해당하는 결과 없음(미확정) — NOT_FOUND status */
function notFoundXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <status>NOT_FOUND</status>
</response>`
}

function xmlResponse(xml: string): Response {
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml' } })
}

function ctxWith(
  env: Record<string, string | undefined>,
  token: string | null = authToken,
): HandlerContext {
  return { env: { ...process.env, ...env }, auth: { token } }
}

const ADDRESS_URL = 'https://api.vworld.kr/req/address'

// V-World 주소 URL만 가로채고 나머지(supabase auth getUser)는 실 fetch로 통과시킨다.
const geocodeMock = vi.fn<typeof fetch>()
const realFetch = globalThis.fetch.bind(globalThis)

beforeAll(async () => {
  authToken = await getTestToken()
})

beforeEach(() => {
  vi.stubGlobal('fetch', ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input) === ADDRESS_URL) return geocodeMock(input, init)
    return realFetch(input, init)
  }) as typeof fetch)
})

afterEach(() => {
  geocodeMock.mockReset()
  vi.unstubAllGlobals()
})

describe('AC-1: V_WORLD_GEOCODER 미설정 → 503, 좌표 비에코·V-World 미호출', () => {
  it('키 없는 env면 503 errorResponseSchema이고 본문에 좌표가 없으며 fetch는 호출되지 않는다', async () => {
    const ctx = ctxWith({ V_WORLD_GEOCODER: undefined })
    const res = await reverseGeocodeHandler(
      { method: 'POST', params: {}, query: {}, body: { lng: LNG, lat: LAT } },
      ctx,
    )

    expect(res.status).toBe(503)
    errorResponseSchema.parse(res.body)
    expect(JSON.stringify(res.body)).not.toContain(String(LNG))
    expect(JSON.stringify(res.body)).not.toContain(String(LAT))
    expect(geocodeMock).not.toHaveBeenCalled()
  })
})

describe('AC-2: 정상 행정구역 반환 → 200 reverseGeocodeResponseSchema', () => {
  it('외부가 {인천광역시,강화군,화도면}을 주면 200·area 3필드를 스키마대로 반환한다', async () => {
    geocodeMock.mockResolvedValueOnce(xmlResponse(addressXml()))

    const ctx = ctxWith({ V_WORLD_GEOCODER: 'test-key', V_WORLD_DOMAIN: 'example.com' })
    const res = await reverseGeocodeHandler(
      { method: 'POST', params: {}, query: {}, body: { lng: LNG, lat: LAT } },
      ctx,
    )

    expect(res.status).toBe(200)
    const parsed = reverseGeocodeResponseSchema.parse(res.body)
    expect(parsed.area).toEqual({ sido: '인천광역시', sigungu: '강화군', emd: '화도면' })

    // 좌표·키를 form-urlencoded로 1회 POST했는지(파라미터로만 사용)
    expect(geocodeMock).toHaveBeenCalledTimes(1)
    const [url, init] = geocodeMock.mock.calls[0]
    expect(String(url)).toBe(ADDRESS_URL)
    expect(init?.method).toBe('POST')
    const body = String(init?.body)
    expect(body).toContain(`point=${encodeURIComponent(`${LNG},${LAT}`)}`)
    expect(body).toContain('key=test-key')
    expect(body).toContain('request=getAddress')
    expect(body).toContain('domain=example.com')
  })
})

describe('AC-3: 외부 네트워크/파싱 실패 → 502', () => {
  async function expectBadGateway(setup: () => void): Promise<void> {
    setup()
    const ctx = ctxWith({ V_WORLD_GEOCODER: 'test-key' })
    const res = await reverseGeocodeHandler(
      { method: 'POST', params: {}, query: {}, body: { lng: LNG, lat: LAT } },
      ctx,
    )
    expect(res.status).toBe(502)
    errorResponseSchema.parse(res.body)
    // 좌표가 에러 본문에 새지 않는다
    expect(JSON.stringify(res.body)).not.toContain(String(LNG))
  }

  it('fetch reject(네트워크 실패) → 502', async () => {
    await expectBadGateway(() => geocodeMock.mockRejectedValueOnce(new Error('ECONNRESET')))
  })

  it('status=ERROR 응답 → 502', async () => {
    await expectBadGateway(() =>
      geocodeMock.mockResolvedValueOnce(
        xmlResponse('<?xml version="1.0"?><response><status>ERROR</status></response>'),
      ),
    )
  })

  it('response 없는 비정상 본문 → 502', async () => {
    await expectBadGateway(() => geocodeMock.mockResolvedValueOnce(xmlResponse('<html>nope</html>')))
  })
})

describe('AC-4: 무세션 → 401, 외부 V-World 미호출', () => {
  it('토큰이 없으면 401이고 fetch(V-World)는 호출되지 않는다', async () => {
    const ctx = ctxWith({ V_WORLD_GEOCODER: 'test-key' }, null)
    const res = await reverseGeocodeHandler(
      { method: 'POST', params: {}, query: {}, body: { lng: LNG, lat: LAT } },
      ctx,
    )
    expect(res.status).toBe(401)
    errorResponseSchema.parse(res.body)
    expect(geocodeMock).not.toHaveBeenCalled()
  })
})

describe('AC-5: 행정구역 미확정 → 200 area:null, 좌표·요청식별자 비에코', () => {
  it('NOT_FOUND 응답이면 area:null로 200을 반환한다', async () => {
    geocodeMock.mockResolvedValueOnce(xmlResponse(notFoundXml()))

    const ctx = ctxWith({ V_WORLD_GEOCODER: 'test-key' })
    const res = await reverseGeocodeHandler(
      { method: 'POST', params: {}, query: {}, body: { lng: LNG, lat: LAT } },
      ctx,
    )

    expect(res.status).toBe(200)
    const parsed = reverseGeocodeResponseSchema.parse(res.body)
    expect(parsed.area).toBeNull()
    // 좌표가 응답에 에코되지 않는다(절충 4)
    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain(String(LNG))
    expect(serialized).not.toContain(String(LAT))
  })

  it('일부 필드 누락(emd 없음)이면 area:null로 200을 반환한다(부분 행정구역 비반환)', async () => {
    geocodeMock.mockResolvedValueOnce(xmlResponse(addressXml({ level4L: '' })))

    const ctx = ctxWith({ V_WORLD_GEOCODER: 'test-key' })
    const res = await reverseGeocodeHandler(
      { method: 'POST', params: {}, query: {}, body: { lng: LNG, lat: LAT } },
      ctx,
    )

    expect(res.status).toBe(200)
    const parsed = reverseGeocodeResponseSchema.parse(res.body)
    expect(parsed.area).toBeNull()
  })
})
