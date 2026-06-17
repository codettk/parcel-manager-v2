import { describe, expect, it } from 'vitest'
import { sanitizeDecimalInput, toRecipeNumber } from '../../../src/features/calculator/calc'
import {
  canSaveDraft,
  draftWage,
  makeDraft,
  toWorkerInput,
  type WorkLogDraft,
} from '../../../src/features/erp/worklog/draft'
import type { WorkLog } from '../../../src/types/api/workLogs'

// 명세: docs/specs/erp-worklog.md — AC-3 (근무율 문자열 draft, M-10 재사용) + draft 변환 로직.

describe('AC-3: 근무율 문자열 draft (M-10 sanitizeDecimalInput·toRecipeNumber 재사용)', () => {
  it('sanitizeDecimalInput은 숫자·점 외 문자를 제거한다 ("0.5a" → "0.5")', () => {
    expect(sanitizeDecimalInput('0.5a')).toBe('0.5')
  })

  it('trailing dot("1.")은 입력 중간 상태로 보존된다', () => {
    expect(sanitizeDecimalInput('1.')).toBe('1.')
  })

  it('toRecipeNumber("1.") = 1, toRecipeNumber("") = 0', () => {
    expect(toRecipeNumber('1.')).toBe(1)
    expect(toRecipeNumber('')).toBe(0)
  })
})

describe('draftWage — 일당 문자열 → 0 이상 정수', () => {
  it('숫자 외 문자를 제거하고 정수화한다', () => {
    expect(draftWage('150,000원')).toBe(150000)
    expect(draftWage('')).toBe(0)
    expect(draftWage('abc')).toBe(0)
  })
})

describe('toWorkerInput — draft 라인 → 서버 입력 (스냅샷 이름 제외)', () => {
  it('staffId·정수 일당·숫자 근무율만 추출한다', () => {
    expect(
      toWorkerInput({
        staffId: 's1',
        staffNameSnapshot: '김씨',
        appliedWage: '80000',
        workRatio: '0.5',
      }),
    ).toEqual({ staffId: 's1', appliedWage: 80000, workRatio: 0.5 })
  })
})

describe('makeDraft — 편집 대상 → draft', () => {
  it('신규(undefined)는 빈 제목·빈 라인', () => {
    const d = makeDraft(undefined)
    expect(d.title).toBe('')
    expect(d.workers).toEqual([])
    expect(d.workDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('편집 대상의 숫자 필드를 문자열 draft로 변환한다', () => {
    const log: WorkLog = {
      logId: 'wlg1',
      workDate: '2026-06-18',
      title: '정식',
      memo: '오후',
      workers: [{ staffId: 's1', staffNameSnapshot: '김씨', appliedWage: 80000, workRatio: 1.5 }],
      totalCost: 120000,
      createdBy: null,
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    }
    const d = makeDraft(log)
    expect(d.workers[0]).toEqual({
      staffId: 's1',
      staffNameSnapshot: '김씨',
      appliedWage: '80000',
      workRatio: '1.5',
    })
  })
})

describe('canSaveDraft — 제목 필수 + 라인 근무율 양수', () => {
  const base: WorkLogDraft = {
    workDate: '2026-06-18',
    title: '정식',
    memo: '',
    workers: [{ staffId: 's1', staffNameSnapshot: '김씨', appliedWage: '80000', workRatio: '1' }],
  }

  it('제목 있고 모든 근무율이 양수면 저장 가능', () => {
    expect(canSaveDraft(base)).toBe(true)
  })

  it('빈 제목(공백만)은 저장 불가', () => {
    expect(canSaveDraft({ ...base, title: '   ' })).toBe(false)
  })

  it('근무율이 0인 라인이 있으면 저장 불가 (계약 workRatio>0)', () => {
    expect(
      canSaveDraft({
        ...base,
        workers: [
          { staffId: 's1', staffNameSnapshot: '김씨', appliedWage: '80000', workRatio: '0' },
        ],
      }),
    ).toBe(false)
  })

  it('라인이 0개여도 제목만 있으면 저장 가능(합계 0 허용, 절충 1)', () => {
    expect(canSaveDraft({ ...base, workers: [] })).toBe(true)
  })
})
