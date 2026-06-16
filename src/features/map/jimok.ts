// 지목 필터 순수 로직 (M-14) — 분류는 V-World 지목(lndcgr_code_nm)이 아닌
// 지번(jibun) 끝글자 휴리스틱으로 판정한다 (v1 app.jsx:679-683 보존, 시드 전에도 동작).

/** 끝글자 직매핑 지목 5종 (v1 constants.js:29) */
export const MAIN_JIMOK = ['답', '전', '대', '도', '임'] as const

/** 필터 후보 6종 고정 — 데이터 distinct가 아닌 상수 (v1 ALL_ITEMS + '기타') */
export const ALL_JIMOK = ['답', '전', '대', '도', '임', '기타'] as const

export type JimokKey = (typeof ALL_JIMOK)[number]

/** 칩 표기 라벨 (v1 constants.js:30 JIMOK_LABELS) */
export const JIMOK_LABELS: Record<JimokKey, string> = {
  답: '답(논)',
  전: '전(밭)',
  대: '대지',
  도: '도로',
  임: '임야',
  기타: '기타',
}

/**
 * 지번 끝글자로 지목 분류 (v1 보존).
 * 끝글자가 MAIN_JIMOK에 들면 그 글자, 아니면 '기타'.
 */
export function classifyJimok(jibun: string): JimokKey {
  const last = jibun.slice(-1)
  return (MAIN_JIMOK as readonly string[]).includes(last) ? (last as JimokKey) : '기타'
}

/** 지번을 가진 필지 (가시 집합 산출 입력 — EngineParcel 부분집합) */
interface JimokParcel {
  id: string
  jibun: string
}

/**
 * 선택 지목 배열로 가시 필지 id 집합 산출 (v1 filteredData 의미론 보존):
 * 6종 전체→전부 가시, 0종→가시 0건, 부분→해당 분류만 가시.
 */
export function visibleParcelIds(
  selected: readonly JimokKey[],
  parcels: readonly JimokParcel[],
): Set<string> {
  if (selected.length === ALL_JIMOK.length) return new Set(parcels.map((p) => p.id))
  if (selected.length === 0) return new Set()
  const allow = new Set(selected)
  const visible = new Set<string>()
  for (const p of parcels) {
    if (allow.has(classifyJimok(p.jibun))) visible.add(p.id)
  }
  return visible
}

/** isAll — 6종 전체 선택 여부 ('전체' 칩 토글·선택 표시 판정) */
export function isAllJimok(selected: readonly JimokKey[]): boolean {
  return ALL_JIMOK.every((k) => selected.includes(k))
}
