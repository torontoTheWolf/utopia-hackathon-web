import type { LatLng } from './geo'

export type TravelMode = 'foot' | 'car'

export const TRAVEL_MODES: Record<TravelMode, { label: string }> = {
  foot: { label: 'Walk' },
  car: { label: 'Drive' },
}

// `steps` are turn-by-turn directions, when the router gives them.
export type Route = { distanceKm: number; path: LatLng[]; steps?: RouteStep[] }

export type RouteStep = { text: string; distanceKm: number }

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
  if (points.length < 2) return null
  if (!('steps' in json) || !Array.isArray(json.steps)) return { distanceKm, path: points }
  const steps = json.steps.flatMap((step: unknown): RouteStep[] =>
    typeof step === 'object' && step !== null && 'text' in step && 'distanceKm' in step &&
    typeof step.text === 'string' && isFiniteNumber(step.distanceKm)
      ? [{ text: step.text, distanceKm: step.distanceKm }]
      : [],
  )
  return { distanceKm, path: points, steps }
}

export function formatDistance(km: number): string {
  const metres = Math.round(km * 100) * 10
  return metres < 1000 ? `${metres} m` : `${km.toFixed(1)} km`
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
