import { z } from 'zod'

/** 인증 제공자 — 카카오만 실구현, apple·phone은 "준비 중"(세션 미수립, AC-8) */
export const authProviderSchema = z.enum(['kakao', 'apple', 'phone'])
export type AuthProvider = z.infer<typeof authProviderSchema>

/**
 * GET /api/me — 현재 세션 사용자 신원.
 * 비로그인(무/만료 토큰)이면 401 + errorResponseSchema(common.ts) — 본 스키마 미반환.
 * clientId(에코 가드)와 직교: 신원은 userId, 디바이스 에코 식별은 clientId로 분리.
 */
export const meResponseSchema = z.object({
  userId: z.string().uuid(),
  provider: authProviderSchema,
  displayName: z.string().min(1),
  avatarUrl: z.string().url().nullable(),
  email: z.string().email().nullable(),
})
export type MeResponse = z.infer<typeof meResponseSchema>

/**
 * 네이티브 셸 → 웹뷰 토큰 핸드오프 페이로드 (AuthBridge 수신 계약).
 * 네이티브 앱이 소셜 로그인 후 Supabase 세션 토큰을 웹뷰로 전달한다.
 * 실제 네이티브 셸 구현은 슬라이스 8 — 이번 슬라이스는 수신 계약·스텁 검증만(AC-13·14).
 * 누락/형식오류는 parse 실패, 만료는 expiresAt 검사로 핸드오프 에러 폴백(㊹).
 */
export const handoffTokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  /** epoch seconds — 만료 검사용 (AC-14) */
  expiresAt: z.number().int().positive().optional(),
  provider: authProviderSchema.optional(),
})
export type HandoffToken = z.infer<typeof handoffTokenSchema>
