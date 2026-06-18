// 재고 도메인 표시·숫자 변환 유틸 — React 비의존. 숫자 입력은 M-10 sanitizeDecimalInput/toRecipeNumber
// 재사용(절충 0·AC-3), 금액 산출은 서버 권위(quantity × unitPrice)와 동형으로 클라 미리보기만 한다.
import { toRecipeNumber } from '../../calculator/calc'

/** 천단위 구분 + "원" — 단가·금액 표기 (worklog formatWon 선례) */
export function formatWon(won: number): string {
  return `${won.toLocaleString('ko')}원`
}

/** 수량 표기 — 정수면 천단위, 소수면 최대 2자리 (calc formatRecipeAmount 선례). 부호는 호출부 소관 */
export function formatQty(value: number): string {
  return value % 1 === 0
    ? value.toLocaleString('ko')
    : value.toLocaleString('ko', { maximumFractionDigits: 2 })
}

/** 오늘 날짜 YYYY-MM-DD (로컬) — 신규 거래 기본 거래일 (worklog todayIso 선례) */
export function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * draft 단가/금액 문자열 → 0 이상 정수 또는 null (빈 값은 null).
 * 계약(unitPrice·amount는 int)에 맞춰 정수로 내림 처리. 비숫자는 toRecipeNumber로 0 흡수.
 */
export function parsePrice(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = toRecipeNumber(trimmed)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

/**
 * draft 수량 문자열 → 양수 또는 null (계약 quantity > 0).
 * 0·음수·빈 값·비숫자는 null(저장 불가 — canSave가 막는다).
 */
export function parseQty(raw: string): number | null {
  const n = toRecipeNumber(raw.trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 거래 금액 미리보기 — 수량·단가 draft로 산출. 단가 비면 null (서버 amount 동형, AC-18) */
export function previewAmount(qtyRaw: string, priceRaw: string): number | null {
  const qty = parseQty(qtyRaw)
  const price = parsePrice(priceRaw)
  if (qty === null || price === null) return null
  return Math.round(qty * price)
}
