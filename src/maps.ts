import type { LatLng } from './geo'

export type MapsApp = 'apple' | 'google'

export const MAPS_APPS: Record<MapsApp, { label: string; directionsUrl: (to: LatLng) => string }> = {
  apple: {
    label: 'Apple Maps',
    directionsUrl: ({ lat, lng }) => `https://maps.apple.com/?daddr=${lat},${lng}`,
  },
  google: {
    label: 'Google Maps',
    directionsUrl: ({ lat, lng }) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  },
}

export function preferredMapsApp(userAgent: string): MapsApp {
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent) ? 'apple' : 'google'
}
