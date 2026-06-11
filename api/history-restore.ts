import { vercelAdapter } from '../server/adapters/vercel'
import { historyRestoreHandler } from '../server/handlers/history'

export default vercelAdapter(historyRestoreHandler, ['id'])
