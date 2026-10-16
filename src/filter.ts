import { PLACE_KINDS, PLACES_FOR_EMOTION, type PlaceKindId } from './places'

// The kinds of place someone never wants to be sent to, remembered in their browser.

const STORAGE_KEY = 'avoided-place-kinds'

// Every kind the app suggests for some emotion, by name.
export const FILTERABLE_KINDS: readonly PlaceKindId[] = [...new Set(Object.values(PLACES_FOR_EMOTION).flat())].sort((a, b) =>
  PLACE_KINDS[a].label.localeCompare(PLACE_KINDS[b].label),
)

export function loadAvoided(): ReadonlySet<PlaceKindId> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return new Set(Array.isArray(saved) ? saved.filter((kind): kind is PlaceKindId => Object.hasOwn(PLACE_KINDS, kind)) : [])
  } catch {
    return new Set()
  }
}

export function saveAvoided(kinds: ReadonlySet<PlaceKindId>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...kinds]))
  } catch {
    // Storage is off, as in some private windows, so the filter lasts only until the page closes.
  }
}

export function withKind(kinds: ReadonlySet<PlaceKindId>, kind: PlaceKindId, avoided: boolean): ReadonlySet<PlaceKindId> {
  const next = new Set(kinds)
  if (avoided) next.add(kind)
  else next.delete(kind)
  return next
}
