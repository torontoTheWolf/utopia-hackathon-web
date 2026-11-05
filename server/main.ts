import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createHandler, type Places } from './api.ts'
import { startGraphHopper } from './graphhopper.ts'
import { canPick } from './pick.ts'
import { DEFAULT_EXTRACT, loadPlaceIndex } from './placeIndex.ts'
import { createRouter, loadRoadGraph } from './roadGraph.ts'
import { canSpeak } from './speak.ts'

// Serves the places API on this machine, from the whole extract and with GraphHopper running alongside.

const HOST = '127.0.0.1'
const PORT = 8787

const pbfPath = process.argv[2] ?? DEFAULT_EXTRACT

// ANTHROPIC_API_KEY can go in .env.local, which git ignores. Vite passes only the VITE_ variables in it to the browser.
const ENV_FILE = fileURLToPath(new URL('../.env.local', import.meta.url))
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)
let places: Places

// When Vite starts the API, it keeps an IPC channel open until it exits.
process.on('disconnect', () => process.exit())

const handle = createHandler(() => places)
const server = createServer((request, response) => void handle(request, response))

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EADDRINUSE') throw error
  console.error(`Places API: port ${PORT} is taken, so the API is probably already running.`)
  process.exit(1)
})

// Listening before indexing makes a second copy stop at once, and requests made while indexing wait for it instead of failing.
server.listen(PORT, HOST, () => {
  places = { index: loadPlaceIndex(pbfPath), router: createRouter(loadRoadGraph(pbfPath)), graphHopper: startGraphHopper(pbfPath) }
  console.log(`Places API listening on http://${HOST}:${PORT}`)
  console.log(canPick() ? 'Places API: Claude picks the suggested places' : 'Places API: no ANTHROPIC_API_KEY, so suggestions are the closest places')
  console.log(canSpeak() ? 'Places API: ElevenLabs reads text aloud' : 'Places API: no ELEVENLABS_API_KEY, so the megaphones stay silent')
})
