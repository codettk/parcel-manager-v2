import { vercelAdapter } from '../server/adapters/vercel.js'
import { calcRecipesHandler } from '../server/handlers/calcRecipes.js'

export default vercelAdapter(calcRecipesHandler)
