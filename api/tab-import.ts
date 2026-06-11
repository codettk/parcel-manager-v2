import { vercelAdapter } from '../server/adapters/vercel'
import { tabImportHandler } from '../server/handlers/tabState'

export default vercelAdapter(tabImportHandler, ['tabId'])
