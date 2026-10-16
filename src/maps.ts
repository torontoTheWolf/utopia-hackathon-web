import type { LatLng } from './geo'
import type { TravelMode } from './route'

export type MapsApp = 'apple' | 'google'

export const MAPS_APPS: Record<MapsApp, { directionsUrl: (to: LatLng, mode: TravelMode) => string }> = {
  apple: {
    directionsUrl: ({ lat, lng }, mode) => `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=${mode === 'foot' ? 'w' : 'd'}`,
  },
  google: {
    directionsUrl: ({ lat, lng }, mode) =>
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${mode === 'foot' ? 'walking' : 'driving'}`,
  },
}

export function preferredMapsApp(userAgent: string): MapsApp {
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent) ? 'apple' : 'google'
}
