import { vercelAdapter } from '../server/adapters/vercel.js'
import { historyItemHandler } from '../server/handlers/history.js'

export default vercelAdapter(historyItemHandler, ['id'])
