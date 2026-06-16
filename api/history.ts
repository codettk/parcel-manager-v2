import { vercelAdapter } from '../server/adapters/vercel.js'
import { historyCollectionHandler } from '../server/handlers/history.js'

export default vercelAdapter(historyCollectionHandler)
