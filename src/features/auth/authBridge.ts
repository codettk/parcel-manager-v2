import { handoffTokenSchema, type HandoffToken } from '../../types/api/auth'

/**
 * 네이티브 셸 → 웹뷰 토큰 핸드오프 수신 계약 (AC-13·14).
 * 이번 슬라이스는 수신/스텁만 — 네이티브 발신부(Capacitor)는 슬라이스 8.
 * 네이티브는 부팅 시 window에 핸드오프 페이로드를 주입하거나 postMessage로 전달한다.
 */

/** window 전역 주입 키 — 네이티브 셸이 부팅 직전 채운다 (발신부는 슬라이스 8) */
export const HANDOFF_GLOBAL_KEY = '__PILJI_NATIVE_HANDOFF__'

export type HandoffResult =
  | { kind: 'none' } // 핸드오프 컨텍스트 아님 (웹 직접 접속) — 웹 OAuth 경로로
  | { kind: 'token'; token: HandoffToken } // 유효 토큰 — 세션 수립 진행 (AC-13)
  | { kind: 'error'; code: HandoffErrorCode } // 누락(아님 → none)/형식오류/만료 (AC-14)

export type HandoffErrorCode = 'AUTH_HANDOFF_MALFORMED' | 'AUTH_HANDOFF_EXPIRED'

interface HandoffWindow {
  [HANDOFF_GLOBAL_KEY]?: unknown
}

/**
 * window 전역에서 핸드오프 페이로드를 읽어 검증한다.
 * - 미주입: { none } (웹 컨텍스트 — 정상)
 * - 형식 오류: { error: MALFORMED } → 핸드오프 에러 뷰 (AC-14)
 * - 만료(expiresAt < now): { error: EXPIRED } → 핸드오프 에러 뷰 (AC-14)
 * - 유효: { token } (AC-13)
 */
export function readNativeHandoff(now: number = Date.now()): HandoffResult {
  const raw = (window as unknown as HandoffWindow)[HANDOFF_GLOBAL_KEY]
  if (raw === undefined || raw === null) return { kind: 'none' }
  return parseHandoff(raw, now)
}

/** 페이로드 검증 — postMessage 수신 등 다른 채널에서도 재사용 가능하게 분리 */
export function parseHandoff(raw: unknown, now: number = Date.now()): HandoffResult {
  const parsed = handoffTokenSchema.safeParse(raw)
  if (!parsed.success) return { kind: 'error', code: 'AUTH_HANDOFF_MALFORMED' }
  const token = parsed.data
  if (token.expiresAt !== undefined && token.expiresAt * 1000 <= now) {
    return { kind: 'error', code: 'AUTH_HANDOFF_EXPIRED' }
  }
  return { kind: 'token', token }
}
