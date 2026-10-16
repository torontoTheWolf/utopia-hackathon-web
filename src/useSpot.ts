import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import type { Emotion } from './emotions'
import type { LatLng, LocationState } from './geo'
import { distanceKm, type Place } from './places'
import { formatAnswers, type Answer } from './questions'
import type { Route, TravelMode } from './route'
import { suggestPlace } from './suggest'

export type Suggestion =
  | { status: 'idle' }
  | { status: 'waiting'; emotion: Emotion }
  | { status: 'searching'; emotion: Emotion }
  | { status: 'found'; emotion: Emotion; place: Place; reason: string | null; distanceKm: number }
  | { status: 'none'; emotion: Emotion }
  | { status: 'failed'; emotion: Emotion }
  | { status: 'noLocation'; emotion: Emotion }

// A suggested spot comes with its route for `mode`, from where you were.
export type Spot =
  | { origin: 'suggested'; position: LatLng; name: string; route: { mode: TravelMode; from: LatLng; route: Route | null } }
  | { origin: 'tapped'; position: LatLng }

type Search =
  | { status: 'idle' }
  | { status: 'pending'; emotion: Emotion; answers: readonly (Answer | null)[] }
  | Extract<Suggestion, { status: 'found' | 'none' | 'failed' }>

// The local places API answers in a few milliseconds, so results wait this long to not appear the instant you tap.
const MIN_SEARCH_MS = 150
// The most places remembered as already suggested, which keeps requests short.
const MAX_SEEN = 100

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

// Suggests a place for an emotion and answers, Claude's pick or else the closest, and another each time the same ones are
// entered again.
export function useSpot(location: LocationState, mode: TravelMode) {
  const [search, setSearch] = useState<Search>({ status: 'idle' })
  const [spot, setSpot] = useState<Spot | null>(null)
  // Keyed on the emotion and answers together, so changing either starts again from the best place.
  const [seen, setSeen] = useState<{ key: string | null; ids: readonly string[] }>({ key: null, ids: [] })
  const located = location.status === 'located'

  const runSearch = useEffectEvent((signal: AbortSignal) => {
    if (search.status !== 'pending' || location.status !== 'located') return
    const { emotion, answers } = search
    const key = `${emotion}:${formatAnswers(answers)}`
    const from = location.position
    const deps = { fetch, signal }
    const exclude = seen.key === key ? seen.ids : []
    const next = async () => {
      const found = await suggestPlace(emotion, answers, from, mode, exclude, deps)
      if (found !== null || exclude.length === 0) return { found, skipped: exclude }
      // Every place nearby has been suggested, so start again from the closest.
      return { found: await suggestPlace(emotion, answers, from, mode, [], deps), skipped: [] }
    }
    atLeast(MIN_SEARCH_MS, next()).then(
      ({ found, skipped }) => {
        if (signal.aborted) return
        if (found === null) {
          setSearch({ status: 'none', emotion })
          setSpot(withoutSuggestedSpot)
          return
        }
        const { place, route, reason } = found
        setSeen({ key, ids: [...skipped, place.id].slice(-MAX_SEEN) })
        setSearch({ status: 'found', emotion, place, reason, distanceKm: distanceKm(from, place.position) })
        setSpot({ origin: 'suggested', position: place.position, name: place.name, route: { mode, from, route } })
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

  const suggest = useCallback(
    (emotion: Emotion, answers: readonly (Answer | null)[]) => setSearch({ status: 'pending', emotion, answers }),
    [],
  )

  const tapSpot = useCallback((position: LatLng) => {
    setSearch({ status: 'idle' })
    setSpot({ origin: 'tapped', position })
  }, [])

  return { spot, suggestion: toSuggestion(search, location), suggest, tapSpot }
}
