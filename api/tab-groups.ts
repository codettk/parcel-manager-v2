import { vercelAdapter } from '../server/adapters/vercel'
import { tabGroupsHandler } from '../server/handlers/tabState'

export default vercelAdapter(tabGroupsHandler, ['tabId'])
