import type { LatLng } from '../src/geo.ts'
import { distanceKm, PLACE_KINDS, type PlaceKindId } from '../src/places.ts'
import { readOsmPbf, type Tags } from './osmPbf.ts'

// `name` plus any `name:<language>` tags, with the keys lowercased.
export type Names = Tags

// `id` is the OpenStreetMap element: n, w or r for node, way or relation, then its number.
export type IndexedPlace = { id: string; names: Names; position: LatLng }

export type PlaceIndex = Record<PlaceKindId, IndexedPlace[]>

type Area = { id: string; kinds: PlaceKindId[]; names: Names; rings: (readonly number[])[] }

const KIND_IDS = Object.keys(PLACE_KINDS) as PlaceKindId[]

// Areas are mapped as ways or multipolygon relations, so the file is read three times: relations first to learn which
// ways they are made of, then ways to learn which nodes they need, then nodes for coordinates.
export function buildPlaceIndex(pbfPath: string): PlaceIndex {
  const areas: Area[] = []
  const memberRefs = new Map<number, readonly number[]>()
  const relationAreas: { area: Area; wayIds: number[] }[] = []
  readOsmPbf(pbfPath, {
    relation(id, members, tags) {
      if (tags.type !== 'multipolygon') return
      const kinds = kindsOf(tags)
      if (kinds.length === 0) return
      const wayIds = members.filter((member) => member.type === 'way' && member.role !== 'inner').map((member) => member.id)
      for (const wayId of wayIds) memberRefs.set(wayId, [])
      relationAreas.push({ area: { id: `r${id}`, kinds, names: namesOf(tags), rings: [] }, wayIds })
    },
  })

  readOsmPbf(pbfPath, {
    way(id, refs, tags) {
      if (memberRefs.has(id)) memberRefs.set(id, refs)
      const kinds = kindsOf(tags)
      if (kinds.length > 0) areas.push({ id: `w${id}`, kinds, names: namesOf(tags), rings: [refs] })
    },
  })
  for (const { area, wayIds } of relationAreas) {
    area.rings = wayIds.map((id) => memberRefs.get(id) ?? [])
    areas.push(area)
  }

  const index = Object.fromEntries(KIND_IDS.map((kind) => [kind, []])) as unknown as PlaceIndex
  const coordinates = new Map<number, LatLng | null>()
  for (const area of areas) for (const ring of area.rings) for (const ref of ring) coordinates.set(ref, null)
  readOsmPbf(pbfPath, {
    node(id, lat, lng, tags) {
      if (coordinates.has(id)) coordinates.set(id, { lat, lng })
      const kinds = kindsOf(tags)
      if (kinds.length === 0) return
      const place = { id: `n${id}`, names: namesOf(tags), position: { lat, lng } }
      for (const kind of kinds) index[kind].push(place)
    },
  })

  for (const { id, kinds, names, rings } of areas) {
    const position = centroid(rings.map((ring) => ring.flatMap((ref) => coordinates.get(ref) ?? [])))
    if (position === null) continue
    for (const kind of kinds) index[kind].push({ id, names, position })
  }
  return index
}

export function placesNear(index: PlaceIndex, kind: PlaceKindId, center: LatLng, radiusKm: number): IndexedPlace[] {
  return index[kind].filter((place) => distanceKm(center, place.position) <= radiusKm)
}

// Only named places that anyone may go to.
function kindsOf(tags: Tags): PlaceKindId[] {
  if (tags.name === undefined || tags.name.trim() === '' || tags.access === 'private' || tags.access === 'no') return []
  return KIND_IDS.filter((kind) => Object.entries(PLACE_KINDS[kind].tags).every(([key, value]) => tags[key] === value))
}

function namesOf(tags: Tags): Names {
  const names: { [key: string]: string } = {}
  for (const [key, value] of Object.entries(tags)) {
    if ((key === 'name' || key.startsWith('name:')) && value.trim() !== '') names[key.toLowerCase()] = value.trim()
  }
  return names
}

// The area-weighted center of the closed rings, or the mean of all points when no ring is closed.
function centroid(rings: readonly (readonly LatLng[])[]): LatLng | null {
  let totalArea = 0
  let lat = 0
  let lng = 0
  for (const ring of rings) {
    if (ring.length < 4 || ring[0].lat !== ring.at(-1)!.lat || ring[0].lng !== ring.at(-1)!.lng) continue
    // Measuring from the first point keeps the products small enough to stay precise.
    const origin = ring[0]
    let area = 0
    let x = 0
    let y = 0
    for (let i = 1; i < ring.length - 2; i++) {
      const ax = ring[i].lng - origin.lng
      const ay = ring[i].lat - origin.lat
      const bx = ring[i + 1].lng - origin.lng
      const by = ring[i + 1].lat - origin.lat
      const cross = ax * by - bx * ay
      area += cross
      x += (ax + bx) * cross
      y += (ay + by) * cross
    }
    if (area === 0) continue
    const weight = Math.abs(area)
    totalArea += weight
    lng += (origin.lng + x / (3 * area)) * weight
    lat += (origin.lat + y / (3 * area)) * weight
  }
  if (totalArea > 0) return { lat: lat / totalArea, lng: lng / totalArea }
  const points = rings.flat()
  if (points.length === 0) return null
  return {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
  }
}
