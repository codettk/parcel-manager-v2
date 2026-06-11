import { vercelAdapter } from '../server/adapters/vercel'
import { historyCollectionHandler } from '../server/handlers/history'

export default vercelAdapter(historyCollectionHandler)
