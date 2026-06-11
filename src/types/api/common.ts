import { z } from 'zod'

/** 모든 mutate 요청의 공통 필수 필드 — Realtime 에코 가드(행의 updated_by에 기록) */
export const clientIdSchema = z.string().min(1)

export const mutationBodySchema = z.object({
  clientId: clientIdSchema,
})
export type MutationBody = z.infer<typeof mutationBodySchema>

export const okResponseSchema = z.object({
  ok: z.literal(true),
})
export type OkResponse = z.infer<typeof okResponseSchema>

export const errorResponseSchema = z.object({
  error: z.string(),
})
export type ErrorResponse = z.infer<typeof errorResponseSchema>
