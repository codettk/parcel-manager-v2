import { vercelAdapter } from '../server/adapters/vercel.js'
import { tabParcelHandler } from '../server/handlers/tabState.js'

export default vercelAdapter(tabParcelHandler, ['tabId', 'id'])
