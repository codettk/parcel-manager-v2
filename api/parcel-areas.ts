import { vercelAdapter } from '../server/adapters/vercel'
import { parcelAreasHandler } from '../server/handlers/parcels'

export default vercelAdapter(parcelAreasHandler)
