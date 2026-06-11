import { vercelAdapter } from '../server/adapters/vercel'
import { fetchLandInfoHandler } from '../server/handlers/parcels'

export default vercelAdapter(fetchLandInfoHandler, ['id'])
