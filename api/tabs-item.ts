import { vercelAdapter } from '../server/adapters/vercel.js'
import { tabItemHandler } from '../server/handlers/tabs.js'

export default vercelAdapter(tabItemHandler, ['id'])
