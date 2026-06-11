import { vercelAdapter } from '../server/adapters/vercel'
import { tabsCollectionHandler } from '../server/handlers/tabs'

export default vercelAdapter(tabsCollectionHandler)
