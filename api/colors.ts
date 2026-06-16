import { vercelAdapter } from '../server/adapters/vercel.js'
import { colorsCollectionHandler } from '../server/handlers/colors.js'

export default vercelAdapter(colorsCollectionHandler)
