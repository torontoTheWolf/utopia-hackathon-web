import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import type { LatLng } from '../src/geo.ts'
import { PLACE_KINDS, type PlaceKindId } from '../src/places.ts'
import { buildPlaceIndex, placesNear, type Names, type PlaceIndex } from './placeIndex.ts'

const HOST = '127.0.0.1'
const PORT = 8787
const DEFAULT_EXTRACT = fileURLToPath(new URL('../tmp/thailand-261014.osm.pbf', import.meta.url))
// Bump when buildPlaceIndex changes what it stores, so old caches are rebuilt.
const INDEX_VERSION = 1

const pbfPath = process.argv[2] ?? DEFAULT_EXTRACT
let index: PlaceIndex

// When Vite starts the API, it keeps an IPC channel open until it exits.
process.on('disconnect', () => process.exit())

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${HOST}`)
  if (request.method !== 'GET' || url.pathname !== '/api/places') return send(response, 404, { error: 'Not found' })
  const query = parseQuery(url.searchParams)
  if (query === null) return send(response, 400, { error: 'Expected kind, lat, lng and radiusKm' })
  const languages = preferredLanguages(request.headers['accept-language'])
  const places = placesNear(index, query.kind, query.center, query.radiusKm).map(({ names, position }) => ({
    name: localName(names, languages),
    lat: position.lat,
    lng: position.lng,
  }))
  send(response, 200, places)
})

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EADDRINUSE') throw error
  console.error(`Places API: port ${PORT} is taken, so the API is probably already running.`)
  process.exit(1)
})

// Listening before indexing makes a second copy stop at once, and requests made while indexing wait for it instead of failing.
server.listen(PORT, HOST, () => {
  index = loadIndex(pbfPath)
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

function parseQuery(params: URLSearchParams): { kind: PlaceKindId; center: LatLng; radiusKm: number } | null {
  const kind = params.get('kind') ?? ''
  const [lat, lng, radiusKm] = ['lat', 'lng', 'radiusKm'].map((name) => toNumber(params.get(name)))
  // Written so that NaN fails every check.
  if (!Object.hasOwn(PLACE_KINDS, kind) || !(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180) || !(radiusKm > 0)) {
    return null
  }
  return { kind: kind as PlaceKindId, center: { lat, lng }, radiusKm }
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
