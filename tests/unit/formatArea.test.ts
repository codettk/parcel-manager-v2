import { describe, expect, it } from 'vitest'
import { AREA_UNITS, formatArea } from '../../src/utils/formatArea'

describe('formatArea', () => {
  it('기본 단위(㎡)로 천 단위 구분 포맷한다', () => {
    expect(formatArea(1000)).toBe('1,000 ㎡')
    expect(formatArea(1234.56)).toBe('1,234.6 ㎡')
  })

  it('평 환산: 1000㎡ → 302.5평', () => {
    expect(formatArea(1000, 'pyeong')).toBe('302.5 평')
  })

  it('a 환산: 1/100, 소수 둘째 자리까지', () => {
    expect(formatArea(1000, 'a')).toBe('10 a')
    expect(formatArea(12345, 'a')).toBe('123.45 a')
  })

  it('ha 환산: 1/10000, 소수 넷째 자리 고정', () => {
    expect(formatArea(1000, 'ha')).toBe('0.1000 ha')
    expect(formatArea(123456, 'ha')).toBe('12.3456 ha')
  })

  it('AREA_UNITS는 4개 단위를 정의한다', () => {
    expect(AREA_UNITS.map((u) => u.id)).toEqual(['m2', 'pyeong', 'a', 'ha'])
  })
})
