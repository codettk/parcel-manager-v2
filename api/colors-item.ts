import { vercelAdapter } from '../server/adapters/vercel.js'
import { colorItemHandler } from '../server/handlers/colors.js'

export default vercelAdapter(colorItemHandler, ['id'])
