import { vercelAdapter } from '../server/adapters/vercel'
import { calcRecipesHandler } from '../server/handlers/calcRecipes'

export default vercelAdapter(calcRecipesHandler)
