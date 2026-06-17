// 업무일지 인건비 계산 — 클라이언트 미리보기와 서버 totalCost 권위가 반드시 동일 결과를 내도록
// 단일 순수 모듈로 공유한다 (src/stores·server/handlers/workLogs·테스트가 함께 import).
// src/utils/override.ts와 동형의 클라이언트/서버 공유 로직 패턴 (CLAUDE.md 아키텍처).

export interface WageLine {
  appliedWage: number
  workRatio: number
}

/**
 * 한 인력 라인의 인건비 = round(적용일당 × 근무율).
 * 음수·비유한값(NaN/Infinity)은 0으로 클램프한다 (AC-1 — draft 입력 방어).
 */
export function computeWorkerCost(appliedWage: number, workRatio: number): number {
  if (!Number.isFinite(appliedWage) || !Number.isFinite(workRatio)) return 0
  if (appliedWage < 0 || workRatio < 0) return 0
  return Math.round(appliedWage * workRatio)
}

/** 일지 인건비 합계 = Σ 라인 인건비. 빈 배열은 0 (AC-2). */
export function computeLogTotal(workers: readonly WageLine[]): number {
  return workers.reduce((sum, w) => sum + computeWorkerCost(w.appliedWage, w.workRatio), 0)
}
