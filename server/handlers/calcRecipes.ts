import { putCalcRecipesRequestSchema } from '../../src/types/api/calcRecipes'
import { createDb } from './db'
import { badRequest, methodNotAllowed, ok } from './http'
import type { Handler } from './types'

const CONFIG_KEY = 'calc_recipes'

/** GET /api/calc-recipes · PUT /api/calc-recipes — app_config['calc_recipes'].value 통과 */
export const calcRecipesHandler: Handler = async (req, ctx) => {
  if (req.method === 'GET') {
    const db = createDb(ctx.env)
    const { data, error } = await db
      .from('app_config')
      .select('value')
      .eq('key', CONFIG_KEY)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const value = data ? (data as { value: unknown }).value : null
    return { status: 200, body: { recipes: value } }
  }

  if (req.method === 'PUT') {
    const parsed = putCalcRecipesRequestSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(parsed.error)
    const db = createDb(ctx.env)
    const { error } = await db.from('app_config').upsert(
      {
        key: CONFIG_KEY,
        value: parsed.data.recipes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
    if (error) throw new Error(error.message)
    return ok()
  }

  return methodNotAllowed()
}
