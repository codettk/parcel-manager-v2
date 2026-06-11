import { describe, expect, it } from 'vitest'
import {
  buildResetPatch,
  isClearedOverride,
  normalizeOverride,
} from '../../../server/handlers/override'
import type { ParcelOverride } from '../../../src/types/api/tabState'

function fields(partial: Partial<ParcelOverride>): ParcelOverride {
  return { color: null, style: null, name: null, memo: null, pinned: false, icon: null, ...partial }
}

describe('normalizeOverride (v1 보존 로직)', () => {
  it('color가 있으면 style 기본값은 fill', () => {
    expect(normalizeOverride(fields({ color: 'eco' })).style).toBe('fill')
    expect(normalizeOverride(fields({ color: 'eco', style: 'border' })).style).toBe('border')
  })

  it('color가 없으면 style은 null로 정규화된다', () => {
    expect(normalizeOverride(fields({ style: 'border' })).style).toBeNull()
  })

  it('icon은 pinned 필지에서만 유지된다', () => {
    expect(normalizeOverride(fields({ icon: 'star' })).icon).toBeNull()
    expect(normalizeOverride(fields({ pinned: true, icon: 'star' })).icon).toBe('star')
  })

  it('빈 문자열은 null로 정규화된다', () => {
    const result = normalizeOverride(fields({ color: '', name: '', memo: '' }))
    expect(result.color).toBeNull()
    expect(result.name).toBeNull()
    expect(result.memo).toBeNull()
  })
})

describe('isClearedOverride (clear 판정)', () => {
  it('모든 의미 필드 null + pinned=false면 clear', () => {
    expect(isClearedOverride(fields({}))).toBe(true)
  })

  it('style만 남은 행도 clear로 본다 (색 없는 style은 의미 없음)', () => {
    expect(isClearedOverride(fields({ style: 'border' }))).toBe(true)
  })

  it('의미 필드 하나라도 있으면 clear가 아니다', () => {
    expect(isClearedOverride(fields({ color: 'eco' }))).toBe(false)
    expect(isClearedOverride(fields({ name: '논' }))).toBe(false)
    expect(isClearedOverride(fields({ memo: 'm' }))).toBe(false)
    expect(isClearedOverride(fields({ pinned: true }))).toBe(false)
    expect(isClearedOverride(fields({ icon: 'star' }))).toBe(false)
  })
})

describe('buildResetPatch', () => {
  it('color 초기화는 style도 함께 null 처리한다', () => {
    expect(buildResetPatch(['color'])).toEqual({ color: null, style: null })
  })

  it('name/memo는 해당 필드만, group은 패치 대상이 아니다', () => {
    expect(buildResetPatch(['name', 'memo'])).toEqual({ name: null, memo: null })
    expect(buildResetPatch(['group'])).toEqual({})
  })
})
