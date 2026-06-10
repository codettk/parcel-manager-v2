import { vercelAdapter } from '../server/adapters/vercel'
import { configHandler } from '../server/handlers/config'

export default vercelAdapter(configHandler)
