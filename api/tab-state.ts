import { vercelAdapter } from '../server/adapters/vercel.js'
import { tabStateHandler } from '../server/handlers/tabState.js'

export default vercelAdapter(tabStateHandler, ['tabId'])
