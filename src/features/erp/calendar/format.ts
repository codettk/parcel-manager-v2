// 캘린더 표시 유틸 — React 비의존. 날짜 라벨은 문자열 분해만 사용(UTC 파싱 금지, 절충 3).

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** 요일 헤더 라벨 (일~토) */
export const WEEKDAYS = WEEKDAY_LABELS

/** YYYY-MM 헤더 라벨 → "2026. 06" (문자열 분해만) */
export function formatMonthLabel(year: number, month: number): string {
  return `${year}. ${String(month).padStart(2, '0')}`
}

/** YYYY-MM-DD → "2026-06-12 금요일" 같은 일 상세 헤더 라벨 (로컬 요일 계산은 명시 생성자 사용) */
export function formatDayHeader(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  // 요일만 로컬 Date로 계산 — 연·월·일 명시 생성자라 UTC 파싱 함정 없음(절충 3)
  const weekday = WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()]
  return `${iso} ${weekday}요일`
}

/** 천단위 구분 + "원" — 금액 표기 (worklog/inventory formatWon 동형) */
export function formatWon(won: number): string {
  return `${won.toLocaleString('ko')}원`
}
