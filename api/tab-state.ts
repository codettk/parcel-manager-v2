import { vercelAdapter } from '../server/adapters/vercel'
import { tabStateHandler } from '../server/handlers/tabState'

export default vercelAdapter(tabStateHandler, ['tabId'])
