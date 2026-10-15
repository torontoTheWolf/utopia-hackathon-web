import type { Emotion } from './emotions'
import type { LatLng } from './geo'

type PlaceKind = { label: string; query: string; category: string; type: string }

export const PLACE_KINDS = {
  park: { label: 'park', query: 'park', category: 'leisure', type: 'park' },
  garden: { label: 'garden', query: 'garden', category: 'leisure', type: 'garden' },
  beach: { label: 'beach', query: 'beach', category: 'natural', type: 'beach' },
  sportsCentre: { label: 'sports centre', query: 'sports centre', category: 'leisure', type: 'sports_centre' },
  gym: { label: 'gym', query: 'gym', category: 'leisure', type: 'fitness_centre' },
  cafe: { label: 'cafe', query: 'cafe', category: 'amenity', type: 'cafe' },
  library: { label: 'library', query: 'library', category: 'amenity', type: 'library' },
  restaurant: { label: 'restaurant', query: 'restaurant', category: 'amenity', type: 'restaurant' },
  fastFood: { label: 'fast food place', query: 'fast food', category: 'amenity', type: 'fast_food' },
  marketplace: { label: 'market', query: 'marketplace', category: 'amenity', type: 'marketplace' },
} as const satisfies Record<string, PlaceKind>

export type PlaceKindId = keyof typeof PLACE_KINDS

export const PLACES_FOR_EMOTION: Record<Emotion, readonly PlaceKindId[]> = {
  Happy: ['park', 'garden', 'beach'],
  Angry: ['sportsCentre', 'gym', 'park'],
  Tired: ['cafe', 'library', 'garden'],
  Hungry: ['restaurant', 'fastFood', 'cafe', 'marketplace'],
}

export type Place = { name: string; position: LatLng; kind: PlaceKindId }

export type SearchDeps = {
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>
  random: () => number
  signal: AbortSignal
}

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
const SEARCH_RADIUS_KM = 7.5
const EARTH_RADIUS_KM = 6371
const KM_PER_DEGREE = 111.32
// Rounding the center to 2 decimals moves it by up to 0.005°, so the box grows by that much to still cover the radius around the true position.
const ROUNDING_SLACK_DEGREES = 0.005

export async function findPlace(emotion: Emotion, position: LatLng, { fetch, random, signal }: SearchDeps): Promise<Place | null> {
  for (const kind of shuffle(PLACES_FOR_EMOTION[emotion], random)) {
    const response = await fetch(searchUrl(kind, position), { signal })
    if (!response.ok) throw new Error(`Nominatim responded ${response.status}`)
    const json: unknown = await response.json()
    const nearby = parsePlaces(json, kind).filter((place) => distanceKm(position, place.position) <= SEARCH_RADIUS_KM)
    if (nearby.length > 0) return nearby[Math.floor(random() * nearby.length)]
  }
  return null
}

export function searchUrl(kind: PlaceKindId, center: LatLng): string {
  const lat = Math.round(center.lat * 100) / 100
  const lng = Math.round(center.lng * 100) / 100
  const latSpan = ceilTo2(SEARCH_RADIUS_KM / KM_PER_DEGREE + ROUNDING_SLACK_DEGREES)
  const lngSpan = ceilTo2(SEARCH_RADIUS_KM / (KM_PER_DEGREE * Math.cos(toRadians(lat))) + ROUNDING_SLACK_DEGREES)
  const viewbox = [lng - lngSpan, lat + latSpan, lng + lngSpan, lat - latSpan].map((edge) => edge.toFixed(2)).join(',')
  const params = new URLSearchParams({ q: PLACE_KINDS[kind].query, format: 'jsonv2', limit: '40', bounded: '1', viewbox })
  return `${NOMINATIM_SEARCH}?${params}`
}

export function parsePlaces(json: unknown, kind: PlaceKindId): Place[] {
  if (!isList(json)) return []
  const { category, type } = PLACE_KINDS[kind]
  return json.flatMap((result): Place[] => {
    if (!isRecord(result) || result.category !== category || result.type !== type) return []
    const { name } = result
    const lat = parseCoordinate(result.lat)
    const lng = parseCoordinate(result.lon)
    if (typeof name !== 'string' || name.trim() === '' || lat === null || lng === null) return []
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

function parseCoordinate(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === 'object' && value !== null
}

function ceilTo2(value: number): number {
  return Math.ceil(value * 100) / 100
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}
