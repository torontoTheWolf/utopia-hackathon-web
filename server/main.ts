import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import type { LatLng } from '../src/geo.ts'
import { PLACE_KINDS, type PlaceKindId } from '../src/places.ts'
import { TRAVEL_MODES, type TravelMode } from '../src/route.ts'
import { buildPlaceIndex, placesNear, type Names, type PlaceIndex } from './placeIndex.ts'
import { createRouter, loadRoadGraph } from './roadGraph.ts'

const HOST = '127.0.0.1'
const PORT = 8787
const DEFAULT_EXTRACT = fileURLToPath(new URL('../tmp/thailand-261014.osm.pbf', import.meta.url))
// Bump when buildPlaceIndex changes what it stores, so old caches are rebuilt.
const INDEX_VERSION = 1

const pbfPath = process.argv[2] ?? DEFAULT_EXTRACT
let index: PlaceIndex
let findRoute: ReturnType<typeof createRouter>

// When Vite starts the API, it keeps an IPC channel open until it exits.
process.on('disconnect', () => process.exit())

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${HOST}`)
  if (request.method === 'GET' && url.pathname === '/api/places') return servePlaces(url.searchParams, request, response)
  if (request.method === 'GET' && url.pathname === '/api/route') return serveRoute(url.searchParams, response)
  send(response, 404, { error: 'Not found' })
})

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EADDRINUSE') throw error
  console.error(`Places API: port ${PORT} is taken, so the API is probably already running.`)
  process.exit(1)
})

// Listening before indexing makes a second copy stop at once, and requests made while indexing wait for it instead of failing.
server.listen(PORT, HOST, () => {
  index = loadIndex(pbfPath)
  findRoute = createRouter(loadRoadGraph(pbfPath))
  console.log(`Places API listening on http://${HOST}:${PORT}`)
})

// The index is cached next to the extract, and rebuilt when the extract or the place kinds change.
function loadIndex(path: string): PlaceIndex {
  const cachePath = `${path}.places.json`
  const { size, mtimeMs } = statSync(path)
  const key = JSON.stringify({ version: INDEX_VERSION, size, mtimeMs, kinds: PLACE_KINDS })
  try {
    const cached = JSON.parse(readFileSync(cachePath, 'utf8'))
    if (cached.key === key) {
      console.log(`Places API: loaded the index from ${cachePath}`)
      return cached.index
    }
  } catch {
    // No usable cache, so build one.
  }
  console.log(`Places API: indexing ${path}, which takes about a minute…`)
  const started = performance.now()
  const built = buildPlaceIndex(path)
  const count = Object.values(built).reduce((sum, places) => sum + places.length, 0)
  console.log(`Places API: indexed ${count} places in ${Math.round((performance.now() - started) / 1000)} s`)
  writeFileSync(cachePath, JSON.stringify({ key, index: built }))
  return built
}

function servePlaces(params: URLSearchParams, request: IncomingMessage, response: ServerResponse): void {
  const kind = params.get('kind') ?? ''
  const center = toLatLng(params.get('lat'), params.get('lng'))
  const radiusKm = toNumber(params.get('radiusKm'))
  // Written so that NaN fails the radius check.
  if (!Object.hasOwn(PLACE_KINDS, kind) || center === null || !(radiusKm > 0)) {
    return send(response, 400, { error: 'Expected kind, lat, lng and radiusKm' })
  }
  const languages = preferredLanguages(request.headers['accept-language'])
  const places = placesNear(index, kind as PlaceKindId, center, radiusKm).map(({ names, position }) => ({
    name: localName(names, languages),
    lat: position.lat,
    lng: position.lng,
  }))
  send(response, 200, places)
}

// Answers 404 when the two points aren't joined by roads for the mode, or either is more than a kilometre from one.
function serveRoute(params: URLSearchParams, response: ServerResponse): void {
  const [from, to] = ['from', 'to'].map((name) => {
    const [lat = null, lng = null, ...rest] = params.get(name)?.split(',') ?? []
    return rest.length === 0 ? toLatLng(lat, lng) : null
  })
  const mode = params.get('mode') ?? ''
  if (from === null || to === null || !Object.hasOwn(TRAVEL_MODES, mode)) {
    return send(response, 400, { error: 'Expected from and to as lat,lng and a mode' })
  }
  const route = findRoute(from, to, mode as TravelMode)
  if (route === null) return send(response, 404, { error: 'No route' })
  // Six decimals is about 10 cm, plenty for drawing.
  const round = (degrees: number) => Math.round(degrees * 1e6) / 1e6
  send(response, 200, { distanceKm: route.distanceKm, path: route.path.map(({ lat, lng }) => [round(lat), round(lng)]) })
}

function toLatLng(lat: string | null, lng: string | null): LatLng | null {
  const position = { lat: toNumber(lat), lng: toNumber(lng) }
  // Written so that NaN fails both checks.
  return Math.abs(position.lat) <= 90 && Math.abs(position.lng) <= 180 ? position : null
}

function toNumber(value: string | null): number {
  return value === null || value.trim() === '' ? NaN : Number(value)
}

function preferredLanguages(acceptLanguage = ''): string[] {
  return acceptLanguage
    .split(',')
    .map((range) => range.split(';')[0].trim().toLowerCase())
    .filter((language) => language !== '' && language !== '*')
}

// Like Nominatim, prefers the name in the browser's languages and falls back to the local name.
function localName(names: Names, languages: readonly string[]): string {
  for (const language of languages) {
    const name = names[`name:${language}`] ?? names[`name:${language.split('-')[0]}`]
    if (name !== undefined) return name
  }
  return names.name
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}
