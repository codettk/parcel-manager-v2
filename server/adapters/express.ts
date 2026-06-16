import type { Request, RequestHandler, Response } from 'express'
import type { Handler } from '../handlers/types.js'

export function expressAdapter(handler: Handler): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const result = await handler(
        {
          method: req.method,
          params: req.params as Record<string, string>,
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
