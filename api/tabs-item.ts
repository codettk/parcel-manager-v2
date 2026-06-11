import { vercelAdapter } from '../server/adapters/vercel'
import { tabItemHandler } from '../server/handlers/tabs'

export default vercelAdapter(tabItemHandler, ['id'])
