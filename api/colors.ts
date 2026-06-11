import { vercelAdapter } from '../server/adapters/vercel'
import { colorsCollectionHandler } from '../server/handlers/colors'

export default vercelAdapter(colorsCollectionHandler)
