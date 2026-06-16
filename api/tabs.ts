import { vercelAdapter } from '../server/adapters/vercel.js'
import { tabsCollectionHandler } from '../server/handlers/tabs.js'

export default vercelAdapter(tabsCollectionHandler)
