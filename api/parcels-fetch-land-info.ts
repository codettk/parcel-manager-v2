import { vercelAdapter } from '../server/adapters/vercel.js'
import { fetchLandInfoHandler } from '../server/handlers/parcels.js'

export default vercelAdapter(fetchLandInfoHandler, ['id'])
