import { vercelAdapter } from '../server/adapters/vercel.js'
import { parcelAreasHandler } from '../server/handlers/parcels.js'

export default vercelAdapter(parcelAreasHandler)
