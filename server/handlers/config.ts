import type { Handler } from './types'
import type { ConfigResponse } from '../../src/types/api/config'

export const configHandler: Handler = async (_req, ctx) => {
  const body: ConfigResponse = {
    supabaseUrl: ctx.env.SUPABASE_URL,
    supabaseAnonKey: ctx.env.SUPABASE_ANON_KEY,
  }
  return { status: 200, body }
}
