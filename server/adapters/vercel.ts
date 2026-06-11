import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Handler } from '../handlers/types'

/**
 * Vercel은 rewrite로 경로 파라미터를 query에 실어 보내므로(vercel.json),
 * paramNames에 해당하는 키를 query에서 분리해 핸들러 계약의 params로 전달한다.
 */
export function vercelAdapter(handler: Handler, paramNames: string[] = []) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      const params: Record<string, string> = {}
      const query: Record<string, string | undefined> = {}
      for (const [key, raw] of Object.entries(req.query ?? {})) {
        const value = Array.isArray(raw) ? raw[0] : raw
        if (paramNames.includes(key)) {
          if (value !== undefined) params[key] = value
        } else {
          query[key] = value
        }
      }
      const result = await handler(
        {
          method: req.method ?? 'GET',
          params,
          query,
          body: req.body,
        },
        { env: process.env },
      )
      res.status(result.status).json(result.body)
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
    }
  }
}
