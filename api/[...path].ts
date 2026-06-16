import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dispatch } from '../server/routes.js'

/**
 * 단일 Vercel 서버리스 함수 — 모든 /api/* 요청을 라우팅 테이블로 디스패치한다.
 * 함수 17→1 통합으로 Hobby 12개 한도를 회피하고 vercel.json rewrite가 불필요해진다.
 * (Vercel 파일시스템 라우팅: [...path].ts는 /api/ 하위 전 경로를 받는다)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const result = await dispatch(req.method ?? 'GET', req.url ?? '/', req.body, process.env)
  res.status(result.status).json(result.body)
}
