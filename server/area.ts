import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import type { LatLng } from '../src/geo.ts'
import { distanceKm } from '../src/places.ts'
import type { RouteStep, TravelMode } from '../src/route.ts'
import type { Places } from './api.ts'
import type { PlaceIndex } from './placeIndex.ts'
import { createRouter, openRoadGraph } from './roadGraph.ts'

// The live site's API runs on Vercel, which can't hold the whole extract or run GraphHopper. The app places everyone at
// one spot for now (FIXED_LOCATION in src/geo.ts), so `npm run area` saves in data/ what the API needs around it: the
// places within the app's search radius, GraphHopper's routes to them from the spot, and the roads within ROADS_KM, for
// the built-in router to reach anywhere else, like a spot tapped on the map. Routes from anywhere else come from the
// built-in router too, or not at all outside the roads.

export const PLACES_FILE = fileURLToPath(new URL('../data/places.json.gz', import.meta.url))
export const ROADS_FILE = fileURLToPath(new URL('../data/roads.bin', import.meta.url))
export const ROADS_KM = 15
// Directions are saved in English, and in these languages where GraphHopper words them differently. Browsers in other
// languages get English.
export const LANGUAGES = ['zh', 'ja', 'ko', 'ru', 'de', 'fr', 'es']

export type Area = {
  origin: LatLng
  index: PlaceIndex
  // By travel mode, then by where the route ends, as routeKey gives it. Places GraphHopper found no route to are left out.
  routes: Record<TravelMode, { [to: string]: SavedRoute }>
}

// `steps` are by language, with `en` always there.
export type SavedRoute = { distanceKm: number; path: [number, number][]; steps: { [language: string]: RouteStep[] } }

// Routes starting this close to the origin count as starting there.
const ORIGIN_KM = 0.01

export function routeKey(to: LatLng): string {
  return `${to.lat},${to.lng}`
}

export function loadArea(): Places {
  const area: Area = JSON.parse(gunzipSync(readFileSync(PLACES_FILE)).toString())
  return {
    index: area.index,
    router: createRouter(openRoadGraph(ROADS_FILE)),
    graphHopper: {
      async route(from, to, mode, locale) {
        const saved = distanceKm(from, area.origin) <= ORIGIN_KM ? area.routes[mode][routeKey(to)] : undefined
        if (saved === undefined) return null
        return {
          distanceKm: saved.distanceKm,
          path: saved.path.map(([lat, lng]) => ({ lat, lng })),
          steps: saved.steps[locale] ?? saved.steps.en,
        }
      },
    },
  }
}
