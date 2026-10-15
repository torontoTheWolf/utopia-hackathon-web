import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import type { Emotion } from './emotions'
import type { LatLng, LocationState } from './geo'
import { distanceKm, findPlace, type Place } from './places'

export type Suggestion =
  | { status: 'idle' }
  | { status: 'waiting'; emotion: Emotion }
  | { status: 'searching'; emotion: Emotion }
  | { status: 'found'; emotion: Emotion; place: Place; distanceKm: number }
  | { status: 'none'; emotion: Emotion }
  | { status: 'failed'; emotion: Emotion }
  | { status: 'noLocation'; emotion: Emotion }

export type Spot = { origin: 'suggested'; position: LatLng; name: string } | { origin: 'tapped'; position: LatLng }

type Search = { status: 'idle' } | { status: 'pending'; emotion: Emotion } | Extract<Suggestion, { status: 'found' | 'none' | 'failed' }>

// The local places API answers in a few milliseconds, so results wait this long to not appear the instant you tap.
const MIN_SEARCH_MS = 150

// Settles the same way as `promise`, but no sooner than `ms` from now.
function atLeast<T>(ms: number, promise: Promise<T>): Promise<T> {
  const pause = new Promise((resolve) => setTimeout(resolve, ms))
  return promise.then(
    (value) => pause.then(() => value),
    (error: unknown) => pause.then(() => Promise.reject(error)),
  )
}

function withoutSuggestedSpot(spot: Spot | null): Spot | null {
  return spot?.origin === 'suggested' ? null : spot
}

function toSuggestion(search: Search, location: LocationState): Suggestion {
  if (search.status !== 'pending') return search
  switch (location.status) {
    case 'locating':
      return { status: 'waiting', emotion: search.emotion }
    case 'located':
      return { status: 'searching', emotion: search.emotion }
    case 'denied':
    case 'unavailable':
      return { status: 'noLocation', emotion: search.emotion }
  }
}

export function useSpot(location: LocationState) {
  const [search, setSearch] = useState<Search>({ status: 'idle' })
  const [spot, setSpot] = useState<Spot | null>(null)
  const located = location.status === 'located'

  const runSearch = useEffectEvent((signal: AbortSignal) => {
    if (search.status !== 'pending' || location.status !== 'located') return
    const { emotion } = search
    const from = location.position
    atLeast(MIN_SEARCH_MS, findPlace(emotion, from, { fetch, random: Math.random, signal })).then(
      (place) => {
        if (signal.aborted) return
        if (place === null) {
          setSearch({ status: 'none', emotion })
          setSpot(withoutSuggestedSpot)
          return
        }
        setSearch({ status: 'found', emotion, place, distanceKm: distanceKm(from, place.position) })
        setSpot({ origin: 'suggested', position: place.position, name: place.name })
      },
      () => {
        if (signal.aborted) return
        setSearch({ status: 'failed', emotion })
        setSpot(withoutSuggestedSpot)
      },
    )
  })

  // Keyed on whether a fix exists, not on the position, so later position updates never restart a search.
  useEffect(() => {
    const controller = new AbortController()
    runSearch(controller.signal)
    return () => controller.abort()
  }, [search, located])

  const suggest = useCallback((emotion: Emotion) => setSearch({ status: 'pending', emotion }), [])

  const tapSpot = useCallback((position: LatLng) => {
    setSearch({ status: 'idle' })
    setSpot({ origin: 'tapped', position })
  }, [])

  return { spot, suggestion: toSuggestion(search, location), suggest, tapSpot }
}
