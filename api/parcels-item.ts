import { vercelAdapter } from '../server/adapters/vercel.js'
import { parcelItemHandler } from '../server/handlers/parcels.js'

export default vercelAdapter(parcelItemHandler, ['id'])
