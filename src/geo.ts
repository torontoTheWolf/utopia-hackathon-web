import { useCallback, useEffect, useRef, useState } from 'react'

export type LatLng = { lat: number; lng: number }

export type LocationState =
  | { status: 'locating' }
  | { status: 'located'; position: LatLng; accuracy: number }
  | { status: 'denied' }
  | { status: 'unavailable' }

// For now everyone is placed at Avani Sukhumvit Bangkok Hotel, by BTS On Nut (OpenStreetMap node 11752122869), and the
// browser's location isn't asked for. Set this to null to use people's real locations again.
const FIXED_LOCATION: { position: LatLng; accuracy: number } | null = {
  position: { lat: 13.7052416, lng: 100.6015603 },
  accuracy: 20,
}

export function useCurrentPosition(): { location: LocationState; locate: () => void } {
  const [location, setLocation] = useState<LocationState>(() =>
    FIXED_LOCATION !== null
      ? { status: 'located', ...FIXED_LOCATION }
      : 'geolocation' in navigator
        ? { status: 'locating' }
        : { status: 'unavailable' },
  )
  const watchId = useRef<number | null>(null)

  const stopWatching = useCallback(() => {
    if (watchId.current === null) return
    navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
  }, [])

  const watch = useCallback(() => {
    if (FIXED_LOCATION !== null || watchId.current !== null || !('geolocation' in navigator)) return
    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setLocation({
          status: 'located',
          position: { lat: coords.latitude, lng: coords.longitude },
          accuracy: coords.accuracy,
        })
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          stopWatching()
          setLocation({ status: 'denied' })
        } else {
          setLocation((current) => (current.status === 'located' ? current : { status: 'unavailable' }))
        }
      },
      { enableHighAccuracy: true },
    )
  }, [stopWatching])

  const locate = useCallback(() => {
    if (FIXED_LOCATION !== null || watchId.current !== null || !('geolocation' in navigator)) return
    setLocation({ status: 'locating' })
    watch()
  }, [watch])

  useEffect(() => {
    watch()
    return stopWatching
  }, [watch, stopWatching])

  return { location, locate }
}
