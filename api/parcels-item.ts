import { vercelAdapter } from '../server/adapters/vercel'
import { parcelItemHandler } from '../server/handlers/parcels'

export default vercelAdapter(parcelItemHandler, ['id'])
