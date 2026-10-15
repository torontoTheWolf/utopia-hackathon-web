import { useCallback, useEffect, useRef, useState } from 'react'

export type LatLng = { lat: number; lng: number }

export type LocationState =
  | { status: 'locating' }
  | { status: 'located'; position: LatLng; accuracy: number }
  | { status: 'denied' }
  | { status: 'unavailable' }

export function useCurrentPosition(): { location: LocationState; locate: () => void } {
  const [location, setLocation] = useState<LocationState>(() =>
    'geolocation' in navigator ? { status: 'locating' } : { status: 'unavailable' },
  )
  const watchId = useRef<number | null>(null)

  const stopWatching = useCallback(() => {
    if (watchId.current === null) return
    navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
  }, [])

  const watch = useCallback(() => {
    if (watchId.current !== null || !('geolocation' in navigator)) return
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
    if (watchId.current !== null || !('geolocation' in navigator)) return
    setLocation({ status: 'locating' })
    watch()
  }, [watch])

  useEffect(() => {
    watch()
    return stopWatching
  }, [watch, stopWatching])

  return { location, locate }
}
