import { afterEach, describe, expect, it } from 'vitest'
import {
  HANDOFF_GLOBAL_KEY,
  parseHandoff,
  readNativeHandoff,
} from '../../../src/features/auth/authBridge'

const NOW = 1_700_000_000_000 // ms

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[HANDOFF_GLOBAL_KEY]
})

describe('parseHandoff (AC-13·14)', () => {
  it('유효 토큰은 { token } 으로 통과한다', () => {
    const res = parseHandoff({ accessToken: 'tok', refreshToken: 'ref' }, NOW)
    expect(res).toEqual({ kind: 'token', token: { accessToken: 'tok', refreshToken: 'ref' } })
  })

  it('형식 오류(필수 필드 누락)는 MALFORMED 에러로 폴백한다 (AC-14)', () => {
    expect(parseHandoff({ refreshToken: 'ref' }, NOW)).toEqual({
      kind: 'error',
      code: 'AUTH_HANDOFF_MALFORMED',
    })
    expect(parseHandoff('not-an-object', NOW)).toEqual({
      kind: 'error',
      code: 'AUTH_HANDOFF_MALFORMED',
    })
  })

  it('expiresAt(epoch sec)이 과거면 EXPIRED 에러로 폴백한다 (AC-14)', () => {
    const expired = Math.floor(NOW / 1000) - 10
    expect(parseHandoff({ accessToken: 'tok', expiresAt: expired }, NOW)).toEqual({
      kind: 'error',
      code: 'AUTH_HANDOFF_EXPIRED',
    })
  })

  it('expiresAt이 미래면 유효 토큰으로 통과한다', () => {
    const future = Math.floor(NOW / 1000) + 3600
    const res = parseHandoff({ accessToken: 'tok', expiresAt: future }, NOW)
    expect(res.kind).toBe('token')
  })
})

describe('readNativeHandoff (AC-13)', () => {
  it('window 주입이 없으면 { none } — 웹 컨텍스트 정상 경로', () => {
    expect(readNativeHandoff(NOW)).toEqual({ kind: 'none' })
  })

  it('window 전역 토큰을 읽어 검증한다', () => {
    ;(window as unknown as Record<string, unknown>)[HANDOFF_GLOBAL_KEY] = {
      accessToken: 'tok',
    }
    expect(readNativeHandoff(NOW)).toEqual({ kind: 'token', token: { accessToken: 'tok' } })
  })

  it('window 전역에 만료 토큰이면 에러로 폴백한다 (AC-14)', () => {
    ;(window as unknown as Record<string, unknown>)[HANDOFF_GLOBAL_KEY] = {
      accessToken: 'tok',
      expiresAt: Math.floor(NOW / 1000) - 1,
    }
    expect(readNativeHandoff(NOW)).toEqual({ kind: 'error', code: 'AUTH_HANDOFF_EXPIRED' })
  })
})
