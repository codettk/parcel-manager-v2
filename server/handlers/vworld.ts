import { XMLParser } from 'fast-xml-parser'

/**
 * V-World 토지임야(ladfrlList) 조회 공용 모듈 — 단건 핸들러(`fetchLandInfoHandler`)와
 * 일괄 스크립트(`scripts/fetch-vworld.ts`)가 **이 모듈 하나만** 사용한다 (v1 이중 구현 폐기).
 *
 * 호출 사양·필드 매핑은 v1 검증분 보존 (명세 docs/specs/vworld-land-info.md §V-World 공용 모듈).
 */

const LADFRL_URL = 'https://api.vworld.kr/ned/data/ladfrlList'

/** V-World 환경 변수 — V_WORLD_LADFRLLIST(필수 키)·V_WORLD_DOMAIN(선택) */
export interface VWorldEnv {
  V_WORLD_LADFRLLIST?: string
  V_WORLD_DOMAIN?: string
}

/** parcels 컬럼 매핑 객체 (snake_case — DB UPDATE에 그대로 사용). vworld_fetched_at은 호출 시각 ISO */
export interface LadfrlMapping {
  ld_code: string | null
  ld_code_nm: string | null
  lndcgr_code: string | null
  lndcgr_code_nm: string | null
  lndpcl_ar: number | null
  posesn_se_code: string | null
  posesn_se_code_nm: string | null
  cnrs_psn_co: number | null
  regstr_se_code: string | null
  regstr_se_code_nm: string | null
  vworld_fetched_at: string
}

/** 실패 사유 — 핸들러는 전부 502로, 스크립트는 사유별 리포트로 분류한다 */
export type LadfrlFailureKind = 'network' | 'parse' | 'no-data'

export type LadfrlResult =
  | { ok: true; mapping: LadfrlMapping }
  | { ok: false; kind: LadfrlFailureKind; message: string }

/** 문자열 trim 후 빈 값이면 null */
function str(value: unknown): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number.parseFloat(String(value))
  return Number.isNaN(n) ? null : n
}

function int(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number.parseInt(String(value), 10)
  return Number.isNaN(n) ? null : n
}

function toMapping(fields: Record<string, unknown>, fetchedAt: string): LadfrlMapping {
  return {
    ld_code: str(fields.ldCode),
    ld_code_nm: str(fields.ldCodeNm),
    lndcgr_code: str(fields.lndcgrCode),
    lndcgr_code_nm: str(fields.lndcgrCodeNm),
    lndpcl_ar: num(fields.lndpclAr),
    posesn_se_code: str(fields.posesnSeCode),
    posesn_se_code_nm: str(fields.posesnSeCodeNm),
    cnrs_psn_co: int(fields.cnrsPsnCo),
    regstr_se_code: str(fields.regstrSeCode),
    regstr_se_code_nm: str(fields.regstrSeCodeNm),
    vworld_fetched_at: fetchedAt,
  }
}

/**
 * pnu(19자리)로 V-World ladfrlList를 form-urlencoded POST 조회 → XML 파싱 →
 * fields.ladfrlVOList(배열이면 첫 항목)를 parcels 컬럼 매핑으로 반환.
 *
 * 네트워크 실패·파싱 실패·무자료를 result 타입으로 구분 — 호출자(핸들러/스크립트)가 분기.
 * env.V_WORLD_LADFRLLIST 존재는 호출자가 보장한다(없으면 503 — 여기까지 오지 않음).
 */
export async function fetchLadfrl(pnu: string, env: VWorldEnv): Promise<LadfrlResult> {
  const params = new URLSearchParams({
    pnu,
    format: 'xml',
    numOfRows: '1',
    pageNo: '1',
    key: env.V_WORLD_LADFRLLIST ?? '',
    ...(env.V_WORLD_DOMAIN ? { domain: env.V_WORLD_DOMAIN } : {}),
  })

  let xmlText: string
  try {
    const response = await fetch(LADFRL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    xmlText = await response.text()
  } catch (e) {
    return { ok: false, kind: 'network', message: e instanceof Error ? e.message : String(e) }
  }

  let fields: unknown
  try {
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xmlText) as {
      fields?: { ladfrlVOList?: unknown }
    }
    const raw = parsed?.fields?.ladfrlVOList
    fields = Array.isArray(raw) ? raw[0] : raw
  } catch (e) {
    return { ok: false, kind: 'parse', message: e instanceof Error ? e.message : String(e) }
  }

  if (fields == null || typeof fields !== 'object') {
    return { ok: false, kind: 'no-data', message: 'V-World 응답에 토지임야 데이터가 없습니다' }
  }

  return {
    ok: true,
    mapping: toMapping(fields as Record<string, unknown>, new Date().toISOString()),
  }
}
