import { vercelAdapter } from '../server/adapters/vercel'
import { historyItemHandler } from '../server/handlers/history'

export default vercelAdapter(historyItemHandler, ['id'])
