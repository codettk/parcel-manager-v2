import { vercelAdapter } from '../server/adapters/vercel.js'
import { historyRestoreHandler } from '../server/handlers/history.js'

export default vercelAdapter(historyRestoreHandler, ['id'])
