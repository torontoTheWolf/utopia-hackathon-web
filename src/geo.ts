import { useCallback, useEffect, useRef, useState } from 'react'

export type LatLng = { lat: number; lng: number }

export type LocationState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'located'; position: LatLng; accuracy: number }
  | { status: 'denied' }
  | { status: 'unavailable' }

export function useCurrentPosition(): { location: LocationState; locate: () => void } {
  const [location, setLocation] = useState<LocationState>({ status: 'idle' })
  const watchId = useRef<number | null>(null)

  const stopWatching = useCallback(() => {
    if (watchId.current === null) return
    navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
  }, [])

  const locate = useCallback(() => {
    if (watchId.current !== null) return
    if (!('geolocation' in navigator)) {
      setLocation({ status: 'unavailable' })
      return
    }
    setLocation({ status: 'locating' })
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

  useEffect(() => {
    let active = true
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((permission) => {
        if (active && permission.state === 'granted') locate()
      })
      .catch(() => {})
    return () => {
      active = false
      stopWatching()
    }
  }, [locate, stopWatching])

  return { location, locate }
}
