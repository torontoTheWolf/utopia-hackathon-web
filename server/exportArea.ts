import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { FIXED_LOCATION } from '../src/geo.ts'
import { PLACE_KINDS, SEARCH_RADIUS_KM, type PlaceKindId } from '../src/places.ts'
import { TRAVEL_MODES, type TravelMode } from '../src/route.ts'
import { LANGUAGES, PLACES_FILE, ROADS_FILE, ROADS_KM, routeKey, type Area, type SavedRoute } from './area.ts'
import { startGraphHopper } from './graphhopper.ts'
import { DEFAULT_EXTRACT, loadPlaceIndex, placesNear, type PlaceIndex } from './placeIndex.ts'
import { cropRoadGraph, loadRoadGraph, saveRoadGraph } from './roadGraph.ts'

// `npm run area` saves the area around FIXED_LOCATION that the live site's API serves (see area.ts). It needs the
// extract and GraphHopper, like `npm run api`, and takes a few minutes. Commit data/ afterwards, and Vercel redeploys.

const pbfPath = process.argv[2] ?? DEFAULT_EXTRACT
// GraphHopper answers routes in milliseconds, so a few at once keep it busy.
const CONCURRENCY = 8
const GRAPHHOPPER_WAIT_MS = 30 * 60_000

if (FIXED_LOCATION === null) {
  console.error('Area: FIXED_LOCATION in src/geo.ts is null, so there is no one spot to save the area around.')
  process.exit(1)
}
const origin = FIXED_LOCATION.position
mkdirSync(dirname(PLACES_FILE), { recursive: true })

const graphHopper = startGraphHopper(pbfPath)

const roads = cropRoadGraph(loadRoadGraph(pbfPath), origin, ROADS_KM)
saveRoadGraph(ROADS_FILE, roads)
console.log(`Area: saved ${roads.edgeTarget.length} road edges within ${ROADS_KM} km to ${ROADS_FILE}`)

const allPlaces = loadPlaceIndex(pbfPath)
const kinds = Object.keys(PLACE_KINDS) as PlaceKindId[]
const index = Object.fromEntries(kinds.map((kind) => [kind, placesNear(allPlaces, kind, origin, SEARCH_RADIUS_KM)])) as PlaceIndex
const ends = [...new Map(Object.values(index).flat().map((place) => [routeKey(place.position), place.position])).values()]
console.log(`Area: ${Object.values(index).flat().length} places within ${SEARCH_RADIUS_KM} km, at ${ends.length} spots`)

const waitStarted = Date.now()
while (!graphHopper.isReady()) {
  if (Date.now() - waitStarted > GRAPHHOPPER_WAIT_MS) {
    console.error('Area: GraphHopper did not start. See tmp/graphhopper/graphhopper.log.')
    process.exit(1)
  }
  await new Promise((resolve) => setTimeout(resolve, 1000))
}

const routes = Object.fromEntries((Object.keys(TRAVEL_MODES) as TravelMode[]).map((mode) => [mode, {}])) as Area['routes']
const jobs = (Object.keys(TRAVEL_MODES) as TravelMode[]).flatMap((mode) => ends.map((to) => ({ mode, to })))
let done = 0
let unreachable = 0
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let job = jobs.pop(); job !== undefined; job = jobs.pop()) {
      const { mode, to } = job
      const route = await graphHopper.route(origin, to, mode, 'en')
      if (route === null) {
        unreachable++
      } else {
        const round = (degrees: number) => Math.round(degrees * 1e6) / 1e6
        const saved: SavedRoute = {
          distanceKm: route.distanceKm,
          path: route.path.map(({ lat, lng }) => [round(lat), round(lng)]),
          steps: { en: route.steps ?? [] },
        }
        const english = JSON.stringify(saved.steps.en)
        for (const language of LANGUAGES) {
          const steps = (await graphHopper.route(origin, to, mode, language))?.steps
          if (steps === undefined) throw new Error(`GraphHopper found a route in English but not in ${language}`)
          if (JSON.stringify(steps) !== english) saved.steps[language] = steps
        }
        routes[mode][routeKey(to)] = saved
      }
      if (++done % 500 === 0) console.log(`Area: ${done} routes`)
    }
  }),
)

const area: Area = { origin, index, routes }
const json = Buffer.from(JSON.stringify(area))
const compressed = gzipSync(json, { level: 9 })
writeFileSync(PLACES_FILE, compressed)
const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1)
console.log(`Area: saved ${done - unreachable} routes (GraphHopper found none for ${unreachable}) to ${PLACES_FILE}`)
console.log(`Area: ${megabytes(json.length)} MB, ${megabytes(compressed.length)} MB compressed. Commit data/ to update the live site.`)
// Stops GraphHopper, if this started it.
process.exit()
