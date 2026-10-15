import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import type { LatLng, LocationState } from './geo'
import { distanceKm } from './places'
import { findRoute, TRAVEL_MODES, type Route, type TravelMode } from './route'
import type { Spot } from './useSpot'

// `route` is null when there is no route, or the places API couldn't be reached.
export type RouteState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; route: Route | null; mode: TravelMode }

// Moving this far from where a route starts fetches a new one.
const REROUTE_KM = 0.05

// The routes to one spot, by travel mode, each with where it starts.
type SpotRoutes = { spot: Spot | null; byMode: Partial<Record<TravelMode, { route: Route | null; from: LatLng }>> }

function routesFor(spot: Spot | null): SpotRoutes {
  return { spot, byMode: spot?.origin === 'suggested' ? { [spot.route.mode]: spot.route } : {} }
}

// Fetches the route for the chosen mode first, then the other modes in the background, so switching is instant.
export function useRoute(location: LocationState, spot: Spot | null, mode: TravelMode): RouteState {
  const position = location.status === 'located' ? location.position : null
  const [origin, setOrigin] = useState<LatLng | null>(position)
  if (position !== null && (origin === null || distanceKm(origin, position) > REROUTE_KM)) setOrigin(position)
  const [routes, setRoutes] = useState<SpotRoutes>(() => routesFor(spot))
  if (routes.spot !== spot) setRoutes(routesFor(spot))

  const needsRoute = useEffectEvent((travelMode: TravelMode, from: LatLng) => {
    const known = routes.byMode[travelMode]
    return known === undefined || distanceKm(known.from, from) > REROUTE_KM
  })

  useEffect(() => {
    if (origin === null || spot === null) return
    const controller = new AbortController()
    const { signal } = controller
    const modes = [mode, ...(Object.keys(TRAVEL_MODES) as TravelMode[]).filter((other) => other !== mode)]
    void (async () => {
      for (const travelMode of modes) {
        if (!needsRoute(travelMode, origin)) continue
        const route = await findRoute(origin, spot.position, travelMode, { fetch, signal }).catch(() => null)
        if (signal.aborted) return
        setRoutes((current) =>
          current.spot === spot ? { spot, byMode: { ...current.byMode, [travelMode]: { route, from: origin } } } : current,
        )
      }
    })()
    return () => controller.abort()
  }, [origin, spot, mode])

  return useMemo((): RouteState => {
    if (origin === null || spot === null) return { status: 'idle' }
    if (routes.spot !== spot) return { status: 'loading' }
    // Until the chosen mode's route arrives, another mode's route to the same spot stays up.
    const shown = routes.byMode[mode] !== undefined ? mode : (Object.keys(routes.byMode) as TravelMode[])[0]
    const known = shown === undefined ? undefined : routes.byMode[shown]
    if (shown === undefined || known === undefined) return { status: 'loading' }
    return { status: 'ready', route: known.route, mode: shown }
  }, [origin, spot, mode, routes])
}
