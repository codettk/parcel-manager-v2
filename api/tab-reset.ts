import { vercelAdapter } from '../server/adapters/vercel'
import { tabResetHandler } from '../server/handlers/tabState'

export default vercelAdapter(tabResetHandler, ['tabId'])
