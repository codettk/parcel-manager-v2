// 재고 현재고 계산 — 거래 원장 합산 파생(절충 1). 품목에 current_qty를 저장하지 않고
// 입고(+)·출고(−) 거래를 합산해 현재고를 도출한다(단일 진실·감사 추적·삭제 자동정합).
// 클라이언트 표시와 서버 응답이 동일 결과를 내도록 단일 순수 모듈로 공유한다
// (src/utils/workLogCost.ts·override.ts와 동형의 클라이언트/서버 공유 패턴).

export type StockTxnType = 'in' | 'out'

export interface StockMovement {
  itemId: string
  type: StockTxnType
  quantity: number
}

/** 수량 정규화 — 양수만 인정, 음수·비유한값은 0 (draft 입력 방어, AC-1) */
function normQty(quantity: number): number {
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}

/**
 * 한 품목의 현재고 = Σ(입고 수량) − Σ(출고 수량).
 * 음수 결과 허용(초과 출고 기록 가능), 빈 배열은 0 (AC-1).
 * 입력은 단일 품목의 거래만 가정하지 않으며 itemId 무관하게 합산하므로 호출부가 품목별로 필터하거나
 * computeBalances를 쓴다.
 */
export function computeItemBalance(movements: readonly StockMovement[]): number {
  return movements.reduce((bal, m) => {
    const q = normQty(m.quantity)
    return m.type === 'in' ? bal + q : bal - q
  }, 0)
}

/** 품목별 현재고 맵 — itemId → 현재고 (AC-2). 거래 없는 품목은 키 부재(호출부가 0으로 간주). */
export function computeBalances(movements: readonly StockMovement[]): Record<string, number> {
  const balances: Record<string, number> = {}
  for (const m of movements) {
    const q = normQty(m.quantity)
    const prev = balances[m.itemId] ?? 0
    balances[m.itemId] = m.type === 'in' ? prev + q : prev - q
  }
  return balances
}
