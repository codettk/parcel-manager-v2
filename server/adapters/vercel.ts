import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Handler } from '../handlers/types'

export function vercelAdapter(handler: Handler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      const result = await handler(
        {
          method: req.method ?? 'GET',
          params: {},
          query: req.query as Record<string, string | undefined>,
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
