import type { Emotion } from './emotions'
import type { LatLng } from './geo'

type PlaceKind = { label: string; category: string; type: string }

export const PLACE_KINDS = {
  park: { label: 'park', category: 'leisure', type: 'park' },
  garden: { label: 'garden', category: 'leisure', type: 'garden' },
  beach: { label: 'beach', category: 'natural', type: 'beach' },
  sportsCentre: { label: 'sports centre', category: 'leisure', type: 'sports_centre' },
  gym: { label: 'gym', category: 'leisure', type: 'fitness_centre' },
  cafe: { label: 'cafe', category: 'amenity', type: 'cafe' },
  library: { label: 'library', category: 'amenity', type: 'library' },
  restaurant: { label: 'restaurant', category: 'amenity', type: 'restaurant' },
  fastFood: { label: 'fast food place', category: 'amenity', type: 'fast_food' },
  marketplace: { label: 'market', category: 'amenity', type: 'marketplace' },
} as const satisfies Record<string, PlaceKind>

export type PlaceKindId = keyof typeof PLACE_KINDS

export const PLACES_FOR_EMOTION: Record<Emotion, readonly PlaceKindId[]> = {
  Happy: ['park', 'garden', 'beach'],
  Angry: ['sportsCentre', 'gym', 'park'],
  Tired: ['cafe', 'library', 'garden'],
  Hungry: ['restaurant', 'fastFood', 'cafe', 'marketplace'],
  Sad: ['park', 'garden', 'cafe'],
}

export type Place = { name: string; position: LatLng; kind: PlaceKindId }

export type SearchDeps = {
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>
  random: () => number
  signal: AbortSignal
}

// Served by `npm run api` from a local OpenStreetMap extract.
const PLACES_API = '/api/places'
const SEARCH_RADIUS_KM = 7.5
const EARTH_RADIUS_KM = 6371

export async function findPlace(emotion: Emotion, position: LatLng, { fetch, random, signal }: SearchDeps): Promise<Place | null> {
  for (const kind of shuffle(PLACES_FOR_EMOTION[emotion], random)) {
    const response = await fetch(searchUrl(kind, position), { signal })
    if (!response.ok) throw new Error(`Places API responded ${response.status}`)
    const json: unknown = await response.json()
    const nearby = parsePlaces(json, kind)
    if (nearby.length > 0) return nearby[Math.floor(random() * nearby.length)]
  }
  return null
}

export function searchUrl(kind: PlaceKindId, center: LatLng): string {
  const params = new URLSearchParams({
    kind,
    lat: String(center.lat),
    lng: String(center.lng),
    radiusKm: String(SEARCH_RADIUS_KM),
  })
  return `${PLACES_API}?${params}`
}

export function parsePlaces(json: unknown, kind: PlaceKindId): Place[] {
  if (!isList(json)) return []
  return json.flatMap((result): Place[] => {
    if (!isRecord(result)) return []
    const { name, lat, lng } = result
    if (typeof name !== 'string' || name.trim() === '' || !isCoordinate(lat) || !isCoordinate(lng)) return []
    return [{ name: name.trim(), position: { lat, lng }, kind }]
  })
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const rest = [...items]
  const shuffled: T[] = []
  while (rest.length > 0) shuffled.push(...rest.splice(Math.floor(random() * rest.length), 1))
  return shuffled
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === 'object' && value !== null
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}
