import type { LatLng } from './geo'

export type TravelMode = 'foot' | 'car'

export const TRAVEL_MODES: Record<TravelMode, { label: string; phrase: string }> = {
  foot: { label: 'Walk', phrase: 'on foot' },
  car: { label: 'Drive', phrase: 'by car' },
}

export type Route = { distanceKm: number; path: LatLng[] }

export type FetchDeps = {
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>
  signal: AbortSignal
}

// Served by `npm run api` from a local OpenStreetMap extract.
const ROUTE_API = '/api/route'

// Resolves to null when there is no route, such as when either end is far from any road.
export async function findRoute(from: LatLng, to: LatLng, mode: TravelMode, { fetch, signal }: FetchDeps): Promise<Route | null> {
  const response = await fetch(routeUrl(from, to, mode), { signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Route API responded ${response.status}`)
  return parseRoute(await response.json())
}

export function routeUrl(from: LatLng, to: LatLng, mode: TravelMode): string {
  const params = new URLSearchParams({ from: `${from.lat},${from.lng}`, to: `${to.lat},${to.lng}`, mode })
  return `${ROUTE_API}?${params}`
}

export function parseRoute(json: unknown): Route | null {
  if (typeof json !== 'object' || json === null || !('distanceKm' in json) || !('path' in json)) return null
  const { distanceKm, path } = json
  if (!isFiniteNumber(distanceKm) || !Array.isArray(path)) return null
  const points = path.flatMap((point: unknown): LatLng[] =>
    Array.isArray(point) && isFiniteNumber(point[0]) && isFiniteNumber(point[1]) ? [{ lat: point[0], lng: point[1] }] : [],
  )
  return points.length >= 2 ? { distanceKm, path: points } : null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
