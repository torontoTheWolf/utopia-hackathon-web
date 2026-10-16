import type { Emotion } from './emotions'
import type { LatLng } from './geo'
import { DISTANCE_FACTORS, PLACE_KINDS, PLACES_FOR_EMOTION, type Place, type PlaceKindId } from './places'
import { formatAnswers, type Answer } from './questions'
import { parseRoute, type FetchDeps, type Route, type TravelMode } from './route'

// `reason` is why Claude picked the place, when it did.
export type PlaceSuggestion = { place: Place; route: Route | null; reason: string | null }

// Served by `npm run api` from a local OpenStreetMap extract.
const SUGGEST_API = '/api/suggest'
const SEARCH_RADIUS_KM = 7.5

// A place for the emotion and answers, with the route there, skipping the place ids in `exclude`: Claude's pick from the
// closest by road, or the closest when Claude isn't set up. Resolves to null when there is none nearby.
export async function suggestPlace(
  emotion: Emotion,
  answers: readonly (Answer | null)[],
  from: LatLng,
  mode: TravelMode,
  exclude: readonly string[],
  { fetch, signal }: FetchDeps,
): Promise<PlaceSuggestion | null> {
  const response = await fetch(suggestUrl(emotion, answers, from, mode, exclude), { signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Places API responded ${response.status}`)
  const suggestion = parseSuggestion(await response.json())
  if (suggestion === null) throw new Error('Places API sent an unreadable suggestion')
  return suggestion
}

export function suggestUrl(
  emotion: Emotion,
  answers: readonly (Answer | null)[],
  from: LatLng,
  mode: TravelMode,
  exclude: readonly string[],
): string {
  const params = new URLSearchParams({
    emotion,
    answers: formatAnswers(answers),
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
  const reason = typeof json.reason === 'string' && json.reason.trim() !== '' ? json.reason.trim() : null
  return { place: { id, name: name.trim(), position: { lat, lng }, kind: kind as PlaceKindId }, route: parseRoute(json.route), reason }
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === 'object' && value !== null
}
