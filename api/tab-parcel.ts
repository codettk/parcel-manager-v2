import { vercelAdapter } from '../server/adapters/vercel'
import { tabParcelHandler } from '../server/handlers/tabState'

export default vercelAdapter(tabParcelHandler, ['tabId', 'id'])
