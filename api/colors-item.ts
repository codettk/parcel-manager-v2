import { vercelAdapter } from '../server/adapters/vercel'
import { colorItemHandler } from '../server/handlers/colors'

export default vercelAdapter(colorItemHandler, ['id'])
