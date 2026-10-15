import type { Emotion } from './emotions'
import type { LatLng } from './geo'
import { DISTANCE_FACTORS, PLACE_KINDS, PLACES_FOR_EMOTION, type Place, type PlaceKindId } from './places'
import { parseRoute, type FetchDeps, type Route, type TravelMode } from './route'

export type PlaceSuggestion = { place: Place; route: Route | null }

// Served by `npm run api` from a local OpenStreetMap extract.
const SUGGEST_API = '/api/suggest'
const SEARCH_RADIUS_KM = 7.5

// The place for the emotion that is closest by road, with the route there, skipping the place ids in `exclude`.
// Resolves to null when there is none nearby.
export async function suggestPlace(
  emotion: Emotion,
  from: LatLng,
  mode: TravelMode,
  exclude: readonly string[],
  { fetch, signal }: FetchDeps,
): Promise<PlaceSuggestion | null> {
  const response = await fetch(suggestUrl(emotion, from, mode, exclude), { signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Places API responded ${response.status}`)
  const suggestion = parseSuggestion(await response.json())
  if (suggestion === null) throw new Error('Places API sent an unreadable suggestion')
  return suggestion
}

export function suggestUrl(emotion: Emotion, from: LatLng, mode: TravelMode, exclude: readonly string[]): string {
  const params = new URLSearchParams({
    kinds: PLACES_FOR_EMOTION[emotion]
      .map((kind) => {
        const factor = DISTANCE_FACTORS[emotion]?.[kind]
        return factor === undefined ? kind : `${kind}:${factor}`
      })
      .join(','),
    lat: String(from.lat),
    lng: String(from.lng),
    radiusKm: String(SEARCH_RADIUS_KM),
    mode,
  })
  if (exclude.length > 0) params.set('exclude', exclude.join(','))
  return `${SUGGEST_API}?${params}`
}

export function parseSuggestion(json: unknown): PlaceSuggestion | null {
  if (!isRecord(json) || !isRecord(json.place)) return null
  const { id, name, kind, lat, lng } = json.place
  if (typeof id !== 'string' || typeof name !== 'string' || name.trim() === '') return null
  if (typeof kind !== 'string' || !Object.hasOwn(PLACE_KINDS, kind) || !isCoordinate(lat) || !isCoordinate(lng)) return null
  return { place: { id, name: name.trim(), position: { lat, lng }, kind: kind as PlaceKindId }, route: parseRoute(json.route) }
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === 'object' && value !== null
}
