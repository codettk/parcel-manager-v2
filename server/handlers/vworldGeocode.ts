import { XMLParser } from 'fast-xml-parser'
import type { AdminArea } from '../../src/types/api/geocode.js'

/**
 * V-World 역지오코딩(좌표 → 행정구역) 공용 모듈 — 핸들러(`reverseGeocodeHandler`)와
 * 향후 스크립트가 **이 모듈 하나만** 사용한다. M-13 `vworld.ts`의 `fetchLadfrl` 운영 모델 동형:
 * 전역 fetch form-urlencoded POST + fast-xml-parser, 키 부재 503·외부 실패 502(핸들러가 변환).
 *
 * 좌표는 외부 호출 파라미터로만 사용하고 결과·로그·에러 메시지에 좌표를 남기지 않는다(명세 절충 4).
 */

const ADDRESS_URL = 'https://api.vworld.kr/req/address'

/** V-World 역지오코딩 환경 변수 — V_WORLD_GEOCODER(reverse 전용 키)·V_WORLD_DOMAIN(선택, 재사용) */
export interface VWorldGeocodeEnv {
  V_WORLD_GEOCODER?: string
  V_WORLD_DOMAIN?: string
}

/** 외부 호출 결과 — 핸들러가 분기: ok+area / ok+null(미확정) / fail(502) */
export type ReverseGeocodeResult =
  | { ok: true; area: AdminArea | null }
  | { ok: false; kind: 'network' | 'parse'; message: string }

/** trim 후 빈 값이면 null */
function str(value: unknown): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * V-World getAddress(type=PARCEL) 응답의 structure에서 행정구역 3필드를 추출.
 * 법정동 주소 구조: level1=시도, level2=시군구, level4L=읍면동(법정동 명).
 * (level4LC는 법정동 코드 — 카탈로그 매칭은 명칭 기반이라 명칭 필드만 사용.)
 */
function pickArea(structure: Record<string, unknown> | undefined): AdminArea | null {
  if (!structure) return null
  const sido = str(structure.level1)
  const sigungu = str(structure.level2)
  // 읍면동: level4L(법정동) 우선, 없으면 level3(일부 응답은 level3에 읍면동) 폴백
  const emd = str(structure.level4L) ?? str(structure.level3)
  // 카탈로그(sido·sigungu·emd) 3필드가 모두 확정돼야 매칭 가능 — 하나라도 없으면 미확정(null)
  if (!sido || !sigungu || !emd) return null
  return { sido, sigungu, emd }
}

/**
 * 좌표(EPSG:4326 lng,lat)로 V-World getAddress(PARCEL=법정동)를 form-urlencoded POST 조회 →
 * XML 파싱 → response.result[].structure에서 {sido, sigungu, emd} 추출.
 *
 * 네트워크 실패·파싱 실패는 fail(핸들러 502). 응답이 정상이나 행정구역 미확정(NOT_FOUND·
 * 빈 result·필드 누락)이면 ok+area:null(핸들러 200 area:null — 클라이언트 무매칭 분기).
 * env.V_WORLD_GEOCODER 존재는 호출자가 보장한다(없으면 503 — 여기까지 오지 않음).
 */
export async function fetchReverseGeocode(
  lng: number,
  lat: number,
  env: VWorldGeocodeEnv,
): Promise<ReverseGeocodeResult> {
  const params = new URLSearchParams({
    service: 'address',
    request: 'getAddress',
    version: '2.0',
    crs: 'epsg:4326',
    type: 'PARCEL', // 법정동 기반(카탈로그 emd가 법정동 단위)
    format: 'xml',
    point: `${lng},${lat}`,
    key: env.V_WORLD_GEOCODER ?? '',
    ...(env.V_WORLD_DOMAIN ? { domain: env.V_WORLD_DOMAIN } : {}),
  })

  let xmlText: string
  try {
    const response = await fetch(ADDRESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    xmlText = await response.text()
  } catch (e) {
    return { ok: false, kind: 'network', message: e instanceof Error ? e.message : String(e) }
  }

  let parsed: {
    response?: {
      status?: unknown
      result?: { structure?: Record<string, unknown> } | { structure?: Record<string, unknown> }[]
    }
  }
  try {
    parsed = new XMLParser({ ignoreAttributes: false }).parse(xmlText) as typeof parsed
  } catch (e) {
    return { ok: false, kind: 'parse', message: e instanceof Error ? e.message : String(e) }
  }

  const response = parsed?.response
  // 응답 자체가 없으면(완전 비정상 본문) 파싱 실패로 간주 — 502
  if (response == null || typeof response !== 'object') {
    return { ok: false, kind: 'parse', message: 'V-World 응답 구조가 올바르지 않습니다' }
  }

  // status가 ERROR면 외부 게이트웨이 실패(키/쿼터/요청 오류) — 502. NOT_FOUND는 미확정으로 처리.
  const status = str(response.status)
  if (status === 'ERROR') {
    return { ok: false, kind: 'parse', message: 'V-World 역지오코딩 응답 오류' }
  }

  const raw = response.result
  const first = Array.isArray(raw) ? raw[0] : raw
  return { ok: true, area: pickArea(first?.structure) }
}
