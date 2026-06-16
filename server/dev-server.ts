import 'dotenv/config'
import express from 'express'
import { expressAdapter } from './adapters/express.js'
import { routes } from './routes.js'

const app = express()
app.use(express.json({ limit: '10mb' }))

// 라우팅 테이블(routes.ts)을 단일 진실로 Express에 등록 — Vercel catch-all과 동일 경로.
type ExpressMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'
for (const route of routes) {
  const method = route.method.toLowerCase() as ExpressMethod
  app[method](route.pattern, expressAdapter(route.handler))
}

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => {
  console.log(`[dev-server] http://localhost:${port}`)
})
