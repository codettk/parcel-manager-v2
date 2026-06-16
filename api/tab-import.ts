import { vercelAdapter } from '../server/adapters/vercel.js'
import { tabImportHandler } from '../server/handlers/tabState.js'

export default vercelAdapter(tabImportHandler, ['tabId'])
