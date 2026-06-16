import 'dotenv/config'
import express from 'express'
import { expressAdapter } from './adapters/express.js'
import { calcRecipesHandler } from './handlers/calcRecipes.js'
import { colorItemHandler, colorsCollectionHandler } from './handlers/colors.js'
import { configHandler } from './handlers/config.js'
import {
  historyCollectionHandler,
  historyItemHandler,
  historyRestoreHandler,
} from './handlers/history.js'
import { fetchLandInfoHandler, parcelAreasHandler, parcelItemHandler } from './handlers/parcels.js'
import {
  tabGroupsHandler,
  tabImportHandler,
  tabParcelHandler,
  tabResetHandler,
  tabStateHandler,
} from './handlers/tabState.js'
import { tabItemHandler, tabsCollectionHandler } from './handlers/tabs.js'

const app = express()
app.use(express.json({ limit: '10mb' }))

app.get('/api/config', expressAdapter(configHandler))

app.get('/api/tabs', expressAdapter(tabsCollectionHandler))
app.post('/api/tabs', expressAdapter(tabsCollectionHandler))
app.patch('/api/tabs/:id', expressAdapter(tabItemHandler))
app.delete('/api/tabs/:id', expressAdapter(tabItemHandler))

app.get('/api/history', expressAdapter(historyCollectionHandler))
app.patch('/api/history/:id', expressAdapter(historyItemHandler))
app.delete('/api/history/:id', expressAdapter(historyItemHandler))
app.post('/api/history/:id/restore', expressAdapter(historyRestoreHandler))

app.get('/api/tabs/:tabId/state', expressAdapter(tabStateHandler))
app.post('/api/tabs/:tabId/parcels/:id', expressAdapter(tabParcelHandler))
app.post('/api/tabs/:tabId/groups', expressAdapter(tabGroupsHandler))
app.post('/api/tabs/:tabId/reset', expressAdapter(tabResetHandler))
app.put('/api/tabs/:tabId/import', expressAdapter(tabImportHandler))

app.get('/api/colors', expressAdapter(colorsCollectionHandler))
app.put('/api/colors', expressAdapter(colorsCollectionHandler))
app.delete('/api/colors/:id', expressAdapter(colorItemHandler))

app.get('/api/calc-recipes', expressAdapter(calcRecipesHandler))
app.put('/api/calc-recipes', expressAdapter(calcRecipesHandler))

app.get('/api/parcel-areas', expressAdapter(parcelAreasHandler))
app.get('/api/parcels/:id', expressAdapter(parcelItemHandler))
app.post('/api/parcels/:id/fetch-land-info', expressAdapter(fetchLandInfoHandler))

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => {
  console.log(`[dev-server] http://localhost:${port}`)
})
