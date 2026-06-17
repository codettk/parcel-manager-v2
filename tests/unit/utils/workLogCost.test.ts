import { describe, expect, it } from 'vitest'
import { computeLogTotal, computeWorkerCost } from '../../../src/utils/workLogCost'

// 명세: docs/specs/erp-worklog.md — AC-1·2 (공유 인건비 계산 순수 함수, 시트 미리보기 = 서버 totalCost)

describe('AC-1: computeWorkerCost(appliedWage, workRatio)', () => {
  it('전일(1.0)은 일당 그대로', () => {
    expect(computeWorkerCost(80000, 1.0)).toBe(80000)
  })

  it('반일(0.5)은 절반', () => {
    expect(computeWorkerCost(80000, 0.5)).toBe(40000)
  })

  it('연장(1.5)은 1.5배', () => {
    expect(computeWorkerCost(80000, 1.5)).toBe(120000)
  })

  it('소수 결과는 반올림', () => {
    expect(computeWorkerCost(70000, 0.333)).toBe(23310)
  })

  it('음수·NaN 입력은 0으로 클램프', () => {
    expect(computeWorkerCost(-80000, 1.0)).toBe(0)
    expect(computeWorkerCost(80000, -0.5)).toBe(0)
    expect(computeWorkerCost(Number.NaN, 1.0)).toBe(0)
    expect(computeWorkerCost(80000, Number.NaN)).toBe(0)
    expect(computeWorkerCost(Number.POSITIVE_INFINITY, 1.0)).toBe(0)
  })
})

describe('AC-2: computeLogTotal(workers)', () => {
  it('라인 3개 합산', () => {
    expect(
      computeLogTotal([
        { appliedWage: 80000, workRatio: 1.0 },
        { appliedWage: 80000, workRatio: 0.5 },
        { appliedWage: 60000, workRatio: 1.0 },
      ]),
    ).toBe(180000)
  })

  it('빈 배열은 0', () => {
    expect(computeLogTotal([])).toBe(0)
  })
})
