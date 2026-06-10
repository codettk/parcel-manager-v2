import { z } from 'zod'

export const configResponseSchema = z.object({
  supabaseUrl: z.string().optional(),
  supabaseAnonKey: z.string().optional(),
})

export type ConfigResponse = z.infer<typeof configResponseSchema>
