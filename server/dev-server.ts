import 'dotenv/config'
import express from 'express'
import { expressAdapter } from './adapters/express'
import { configHandler } from './handlers/config'

const app = express()
app.use(express.json({ limit: '10mb' }))

app.get('/api/config', expressAdapter(configHandler))

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => {
  console.log(`[dev-server] http://localhost:${port}`)
})
