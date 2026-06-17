import { describe, expect, it } from 'vitest'
import { createWorkLogRequestSchema, workLogSchema } from '../../../src/types/api/workLogs'

// 명세: docs/specs/erp-worklog.md — AC-4 (계약 zod 검증). 프론트 클라이언트·핸들러 공유 스키마.

const validLog = {
  logId: 'wlg_abc123',
  workDate: '2026-06-18',
  title: '고추밭 정식',
  memo: null,
  workers: [{ staffId: 's1', staffNameSnapshot: '김씨', appliedWage: 80000, workRatio: 1.0 }],
  totalCost: 80000,
  createdBy: null,
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
}

describe('AC-4: workLogSchema 검증', () => {
  it('유효 일지를 통과시킨다', () => {
    expect(workLogSchema.safeParse(validLog).success).toBe(true)
  })

  it('workDate가 YYYY-MM-DD 형식이 아니면 거부 (2026/6/18)', () => {
    expect(workLogSchema.safeParse({ ...validLog, workDate: '2026/6/18' }).success).toBe(false)
  })

  it('title이 빈 문자열이면 거부', () => {
    expect(workLogSchema.safeParse({ ...validLog, title: '' }).success).toBe(false)
  })
})

describe('AC-4: createWorkLogRequestSchema 생성 요청 검증', () => {
  const validReq = {
    clientId: 'c1',
    workDate: '2026-06-18',
    title: '고추밭 정식',
    workers: [{ staffId: 's1', appliedWage: 80000, workRatio: 1.0 }],
  }

  it('유효 생성 요청을 통과시킨다', () => {
    expect(createWorkLogRequestSchema.safeParse(validReq).success).toBe(true)
  })

  it('appliedWage가 음수면 거부', () => {
    expect(
      createWorkLogRequestSchema.safeParse({
        ...validReq,
        workers: [{ staffId: 's1', appliedWage: -1, workRatio: 1.0 }],
      }).success,
    ).toBe(false)
  })

  it('workRatio가 0 이하면 거부', () => {
    expect(
      createWorkLogRequestSchema.safeParse({
        ...validReq,
        workers: [{ staffId: 's1', appliedWage: 80000, workRatio: 0 }],
      }).success,
    ).toBe(false)
    expect(
      createWorkLogRequestSchema.safeParse({
        ...validReq,
        workers: [{ staffId: 's1', appliedWage: 80000, workRatio: -0.5 }],
      }).success,
    ).toBe(false)
  })

  it('title이 빈 문자열이면 거부', () => {
    expect(createWorkLogRequestSchema.safeParse({ ...validReq, title: '' }).success).toBe(false)
  })
})
