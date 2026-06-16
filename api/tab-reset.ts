import { vercelAdapter } from '../server/adapters/vercel.js'
import { tabResetHandler } from '../server/handlers/tabState.js'

export default vercelAdapter(tabResetHandler, ['tabId'])
