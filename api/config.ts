import { vercelAdapter } from '../server/adapters/vercel.js'
import { configHandler } from '../server/handlers/config.js'

export default vercelAdapter(configHandler)
