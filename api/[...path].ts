import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dispatch } from '../server/routes.js'

/**
 * 단일 Vercel 서버리스 함수 — 모든 /api/* 요청을 라우팅 테이블로 디스패치한다.
 * 함수 17→1 통합으로 Hobby 12개 한도를 회피한다.
 *
 * vercel.json의 `/api/:path*` → 이 함수 rewrite가 중첩 경로(2세그먼트 이상)까지
 * 함수로 라우팅한다. Vercel은 매칭 세그먼트를 req.query.path(배열)로 전달하므로
 * req.url 대신 이걸로 경로를 재구성해 깊이와 무관하게 정확히 디스패치한다.
 * (req.url은 rewrite 후 신뢰할 수 없어 사용하지 않는다.)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const query = req.query as Record<string, string | string[] | undefined>
  const rawPath = query.path
  const segments = Array.isArray(rawPath) ? rawPath : rawPath ? [rawPath] : []

  // path 외의 실제 쿼리 파라미터는 보존해 핸들러에 전달
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (key === 'path') continue
    if (Array.isArray(value)) for (const v of value) search.append(key, v)
    else if (value !== undefined) search.append(key, value)
  }
  const qs = search.toString()
  const url = '/api/' + segments.join('/') + (qs ? `?${qs}` : '')

  const authorization = req.headers.authorization
  const result = await dispatch(req.method ?? 'GET', url, req.body, process.env, authorization)
  res.status(result.status).json(result.body)
}
