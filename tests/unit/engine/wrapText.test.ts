// AC-1·AC-2: 글자 단위 그리디 줄바꿈(v1 utils/text.js 보존) + 결과 캐싱
import { describe, expect, it } from 'vitest'
import { createWrapTextCache, wrapText, type TextMeasurer } from '../../../src/features/map/engine'

/** 글자당 charWidth px 결정적 측정기 — '…'도 1글자 취급 */
function createMeasurer(charWidth = 10): TextMeasurer & { calls(): number } {
  let calls = 0
  return {
    measureText(text) {
      calls++
      return { width: Array.from(text).length * charWidth }
    },
    calls: () => calls,
  }
}

describe('wrapText (AC-1)', () => {
  it('① maxWidth 30·글자당 10px → 3글자/2글자로 글자 단위 분할', () => {
    expect(wrapText(createMeasurer(), '가나다라마', 30, 10)).toEqual(['가나다', '라마'])
  })

  it('① 정확히 maxLines에 들어가면 말줄임 없이 그대로', () => {
    expect(wrapText(createMeasurer(), '가나다라마바', 30, 2)).toEqual(['가나다', '라마바'])
  })

  it('② 첫 글자도 안 들어가는 maxWidth → []', () => {
    expect(wrapText(createMeasurer(), '가나다라마', 5, 10)).toEqual([])
  })

  it('③ maxLines 초과 → 정확히 maxLines줄 + 마지막 줄 말줄임(측정 폭 ≤ maxWidth)', () => {
    const m = createMeasurer()
    const lines = wrapText(m, '가나다라마바사', 30, 2)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('가나다')
    expect(lines[1].endsWith('…')).toBe(true)
    expect(lines[1]).toBe('라마…')
    expect(m.measureText(lines[1]).width).toBeLessThanOrEqual(30)
  })

  it('③ maxLines 1에서도 말줄임된 1줄만 반환', () => {
    expect(wrapText(createMeasurer(), '가나다라마', 30, 1)).toEqual(['가나…'])
  })
})

describe('createWrapTextCache (AC-2)', () => {
  it('동일 (text, maxWidth, maxLines) 2회째는 measureText 없이 동일 결과', () => {
    const m = createMeasurer()
    const cache = createWrapTextCache()
    const first = cache.get(m, '가나다라마', 30, 10)
    const callsAfterFirst = m.calls()
    expect(callsAfterFirst).toBeGreaterThan(0)
    const second = cache.get(m, '가나다라마', 30, 10)
    expect(m.calls()).toBe(callsAfterFirst)
    expect(second).toEqual(first)
    expect(second).toBe(first)
  })

  it('다른 maxWidth로 호출하면 재측정한다', () => {
    const m = createMeasurer()
    const cache = createWrapTextCache()
    cache.get(m, '가나다라마', 30, 10)
    const callsAfterFirst = m.calls()
    const narrower = cache.get(m, '가나다라마', 20, 10)
    expect(m.calls()).toBeGreaterThan(callsAfterFirst)
    expect(narrower).toEqual(['가나', '다라', '마'])
  })
})
