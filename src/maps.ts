import type { LatLng } from './geo'
import type { TravelMode } from './route'

export type MapsApp = 'apple' | 'google'

// Where to go. With a name, Apple and Google Maps look the place up and show it by name; with only coordinates they show
// the nearest street address or a neighbouring business, which can look like a random address.
export type Destination = { position: LatLng; name?: string }

export const MAPS_APPS: Record<MapsApp, { directionsUrl: (to: Destination, mode: TravelMode) => string }> = {
  apple: {
    // Apple's unified Maps URLs, from iOS 18.4 and macOS 15.4.
    directionsUrl: (to, mode) =>
      `https://maps.apple.com/directions?destination=${destination(to)}&mode=${mode === 'foot' ? 'walking' : 'driving'}`,
  },
  google: {
    directionsUrl: (to, mode) =>
      `https://www.google.com/maps/dir/?api=1&destination=${destination(to)}&travelmode=${mode === 'foot' ? 'walking' : 'driving'}`,
  },
}

function destination({ position: { lat, lng }, name }: Destination): string {
  return encodeURIComponent(name ?? `${lat},${lng}`)
}

export function preferredMapsApp(userAgent: string): MapsApp {
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent) ? 'apple' : 'google'
}
