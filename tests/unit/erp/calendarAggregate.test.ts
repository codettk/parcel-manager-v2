import { describe, expect, it } from 'vitest'
import {
  buildMonthGrid,
  groupByDate,
  monthRange,
  summarizeDay,
} from '../../../src/features/erp/calendar/aggregate'
import type { InventoryTransaction } from '../../../src/types/api/inventoryTransactions'
import type { WorkLog } from '../../../src/types/api/workLogs'

// 명세: docs/specs/erp-calendar.md — AC-1~4 집계 순수 함수.
// 날짜 경계(절충 3): YYYY-MM-DD 문자열 키만 사용, UTC 변환으로 하루 밀리지 않음.

function makeLog(workDate: string, totalCost = 0, logId = `log-${workDate}-${totalCost}`): WorkLog {
  return {
    logId,
    workDate,
    title: '작업',
    memo: null,
    workers: [],
    totalCost,
    createdBy: null,
    createdAt: `${workDate}T00:00:00.000Z`,
    updatedAt: `${workDate}T00:00:00.000Z`,
  }
}

function makeTxn(
  txnDate: string,
  type: 'in' | 'out',
  amount: number | null,
  txnId = `txn-${txnDate}-${type}-${amount}`,
): InventoryTransaction {
  return {
    txnId,
    itemId: 'item-1',
    itemNameSnapshot: '요소비료',
    unitSnapshot: '포',
    type,
    quantity: 10,
    txnDate,
    contactId: null,
    contactNameSnapshot: null,
    unitPrice: amount === null ? null : Math.round(amount / 10),
    amount,
    memo: null,
    createdBy: null,
    createdAt: `${txnDate}T00:00:00.000Z`,
  }
}

describe('AC-1: groupByDate — 문자열 키 그룹', () => {
  it('같은 날짜의 업무일지·거래가 같은 키 아래 모인다', () => {
    const logs = [makeLog('2026-06-12'), makeLog('2026-06-20')]
    const txns = [makeTxn('2026-06-12', 'in', 1000), makeTxn('2026-06-20', 'out', 500)]
    const groups = groupByDate(logs, txns)

    expect(groups['2026-06-12'].workLogs).toHaveLength(1)
    expect(groups['2026-06-12'].transactions).toHaveLength(1)
    expect(groups['2026-06-20'].workLogs).toHaveLength(1)
    expect(groups['2026-06-20'].transactions).toHaveLength(1)
  })

  it('항목 없는 날짜는 맵에 키가 없다', () => {
    const groups = groupByDate([makeLog('2026-06-12')], [])
    expect('2026-06-13' in groups).toBe(false)
    expect(Object.keys(groups)).toEqual(['2026-06-12'])
  })

  it('월말 경계 날짜(6/30·12/31)도 정확히 그날에 귀속된다 (UTC 하루 밀림 없음)', () => {
    const groups = groupByDate(
      [makeLog('2026-06-30'), makeLog('2026-12-31')],
      [makeTxn('2026-06-30', 'in', 0)],
    )
    expect(groups['2026-06-30'].workLogs).toHaveLength(1)
    expect(groups['2026-06-30'].transactions).toHaveLength(1)
    expect(groups['2026-12-31'].workLogs).toHaveLength(1)
    // 7/1로 새지 않음
    expect('2026-07-01' in groups).toBe(false)
    expect('2027-01-01' in groups).toBe(false)
  })

  it('빈 입력은 빈 맵', () => {
    expect(groupByDate([], [])).toEqual({})
  })
})

describe('AC-2: summarizeDay — 건수·금액 합계', () => {
  it('업무일지 건수·인건비 합계, 입/출고 건수·금액 합계를 집계한다', () => {
    const logs = [makeLog('2026-06-12', 480000), makeLog('2026-06-12', 100000)]
    const txns = [
      makeTxn('2026-06-12', 'in', 30000),
      makeTxn('2026-06-12', 'in', 20000),
      makeTxn('2026-06-12', 'out', 5000),
    ]
    const s = summarizeDay(logs, txns)
    expect(s.workLogCount).toBe(2)
    expect(s.laborCost).toBe(580000)
    expect(s.inCount).toBe(2)
    expect(s.outCount).toBe(1)
    expect(s.inAmount).toBe(50000)
    expect(s.outAmount).toBe(5000)
  })

  it('amount null은 0으로 무시한다', () => {
    const s = summarizeDay([], [makeTxn('2026-06-12', 'in', null), makeTxn('2026-06-12', 'out', null)])
    expect(s.inCount).toBe(1)
    expect(s.outCount).toBe(1)
    expect(s.inAmount).toBe(0)
    expect(s.outAmount).toBe(0)
  })

  it('빈 입력은 모든 합계·건수 0', () => {
    expect(summarizeDay([], [])).toEqual({
      workLogCount: 0,
      laborCost: 0,
      inCount: 0,
      outCount: 0,
      inAmount: 0,
      outAmount: 0,
    })
  })
})

describe('AC-3: monthRange — 월 from/to (윤년·월말 정확)', () => {
  it('6월은 1~30일', () => {
    expect(monthRange(2026, 6)).toEqual({ from: '2026-06-01', to: '2026-06-30' })
  })

  it('2월 평년은 28일', () => {
    expect(monthRange(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('2월 윤년은 29일', () => {
    expect(monthRange(2024, 2)).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })

  it('1·12월 경계와 31일 월', () => {
    expect(monthRange(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-01-31' })
    expect(monthRange(2026, 12)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})

describe('AC-4: buildMonthGrid — 7열·인접월·오늘', () => {
  it('셀 개수가 7의 배수다', () => {
    const grid = buildMonthGrid(2026, 6, '2026-06-18')
    expect(grid.length % 7).toBe(0)
  })

  it('첫 셀은 그 주 일요일, 현재월 1일이 올바른 요일 칸에 온다', () => {
    // 2026-06-01은 월요일 → 앞에 일요일(5/31) 1칸
    const grid = buildMonthGrid(2026, 6, '2026-06-18')
    expect(grid[0].date).toBe('2026-05-31')
    expect(grid[0].inMonth).toBe(false)
    expect(grid[1].date).toBe('2026-06-01')
    expect(grid[1].inMonth).toBe(true)
  })

  it('현재월 셀은 inMonth=true, 인접월 셀은 false', () => {
    const grid = buildMonthGrid(2026, 6, '2026-06-18')
    const inMonth = grid.filter((c) => c.inMonth)
    expect(inMonth).toHaveLength(30)
    expect(inMonth[0].date).toBe('2026-06-01')
    expect(inMonth[29].date).toBe('2026-06-30')
  })

  it('today 셀만 isToday=true (하루 밀림 없음)', () => {
    const grid = buildMonthGrid(2026, 6, '2026-06-18')
    const todayCells = grid.filter((c) => c.isToday)
    expect(todayCells).toHaveLength(1)
    expect(todayCells[0].date).toBe('2026-06-18')
  })

  it('today가 그리드 범위 밖이면 isToday 셀이 없다 (인접월 채움 셀은 트레일링 주에 포함될 수 있음)', () => {
    // 2026-09는 6월 그리드 어디에도 없다 (인접 채움은 5월말·7월초까지만)
    const grid = buildMonthGrid(2026, 6, '2026-09-15')
    expect(grid.some((c) => c.isToday)).toBe(false)
  })

  it('월말 경계: 6월 그리드 마지막 현재월 셀은 6/30이고 7/1로 새지 않는다', () => {
    const grid = buildMonthGrid(2026, 6, '2026-06-18')
    const cell30 = grid.find((c) => c.date === '2026-06-30')
    expect(cell30).toBeDefined()
    expect(cell30?.inMonth).toBe(true)
    expect(cell30?.day).toBe(30)
  })

  it('2월 윤년 그리드에 2/29 셀이 현재월로 존재', () => {
    const grid = buildMonthGrid(2024, 2, '2024-02-15')
    const leap = grid.find((c) => c.date === '2024-02-29')
    expect(leap?.inMonth).toBe(true)
  })
})
