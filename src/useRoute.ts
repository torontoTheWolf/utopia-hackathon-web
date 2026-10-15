import { useEffect, useMemo, useState } from 'react'
import type { LatLng, LocationState } from './geo'
import { distanceKm } from './places'
import { findRoute, type Route, type TravelMode } from './route'
import type { Spot } from './useSpot'

// `route` is null when there is no route, or the places API couldn't be reached.
export type RouteState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; route: Route | null; mode: TravelMode }

// Moving this far from where the route starts fetches a new one.
const REROUTE_KM = 0.05

export function useRoute(location: LocationState, spot: Spot | null, mode: TravelMode): RouteState {
  const position = location.status === 'located' ? location.position : null
  const [origin, setOrigin] = useState<LatLng | null>(position)
  if (position !== null && (origin === null || distanceKm(origin, position) > REROUTE_KM)) setOrigin(position)
  const [result, setResult] = useState<{ spot: Spot; mode: TravelMode; route: Route | null } | null>(null)

  useEffect(() => {
    if (origin === null || spot === null) return
    const controller = new AbortController()
    const { signal } = controller
    findRoute(origin, spot.position, mode, { fetch, signal })
      .catch(() => null)
      .then((route) => {
        if (!signal.aborted) setResult({ spot, mode, route })
      })
    return () => controller.abort()
  }, [origin, spot, mode])

  return useMemo((): RouteState => {
    if (origin === null || spot === null) return { status: 'idle' }
    // A route to another spot would be wrong, but one to this spot stays up while a new mode or start is fetched.
    if (result?.spot !== spot) return { status: 'loading' }
    return { status: 'ready', route: result.route, mode: result.mode }
  }, [origin, spot, result])
}
