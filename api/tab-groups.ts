import { vercelAdapter } from '../server/adapters/vercel.js'
import { tabGroupsHandler } from '../server/handlers/tabState.js'

export default vercelAdapter(tabGroupsHandler, ['tabId'])
