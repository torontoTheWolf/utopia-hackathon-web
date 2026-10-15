import type { Emotion } from './emotions'
import type { LatLng } from './geo'

// A place of a kind has all of the kind's OpenStreetMap tags.
type PlaceKind = { label: string; tags: { readonly [key: string]: string } }

export const PLACE_KINDS = {
  aquarium: { label: 'aquarium', tags: { tourism: 'aquarium' } },
  attraction: { label: 'tourist attraction', tags: { tourism: 'attraction' } },
  bakery: { label: 'bakery', tags: { shop: 'bakery' } },
  beach: { label: 'beach', tags: { natural: 'beach' } },
  bookshop: { label: 'bookshop', tags: { shop: 'books' } },
  cafe: { label: 'cafe', tags: { amenity: 'cafe' } },
  cinema: { label: 'cinema', tags: { amenity: 'cinema' } },
  climbing: { label: 'climbing spot', tags: { sport: 'climbing' } },
  fastFood: { label: 'fast food place', tags: { amenity: 'fast_food' } },
  foodCourt: { label: 'food court', tags: { amenity: 'food_court' } },
  gallery: { label: 'art gallery', tags: { tourism: 'gallery' } },
  garden: { label: 'garden', tags: { leisure: 'garden' } },
  gym: { label: 'gym', tags: { leisure: 'fitness_centre' } },
  iceCream: { label: 'ice cream shop', tags: { amenity: 'ice_cream' } },
  library: { label: 'library', tags: { amenity: 'library' } },
  mall: { label: 'shopping mall', tags: { shop: 'mall' } },
  marketplace: { label: 'market', tags: { amenity: 'marketplace' } },
  massage: { label: 'massage shop', tags: { shop: 'massage' } },
  museum: { label: 'museum', tags: { tourism: 'museum' } },
  park: { label: 'park', tags: { leisure: 'park' } },
  restaurant: { label: 'restaurant', tags: { amenity: 'restaurant' } },
  runningTrack: { label: 'running track', tags: { leisure: 'track' } },
  sportsCentre: { label: 'sports centre', tags: { leisure: 'sports_centre' } },
  swimmingPool: { label: 'swimming pool', tags: { leisure: 'swimming_pool' } },
  temple: { label: 'temple', tags: { amenity: 'place_of_worship', religion: 'buddhist' } },
  themePark: { label: 'theme park', tags: { tourism: 'theme_park' } },
  viewpoint: { label: 'viewpoint', tags: { tourism: 'viewpoint' } },
  waterfall: { label: 'waterfall', tags: { waterway: 'waterfall' } },
  waterPark: { label: 'water park', tags: { leisure: 'water_park' } },
  zoo: { label: 'zoo', tags: { tourism: 'zoo' } },
} as const satisfies Record<string, PlaceKind>

export type PlaceKindId = keyof typeof PLACE_KINDS

export const PLACES_FOR_EMOTION: Record<Emotion, readonly PlaceKindId[]> = {
  // Somewhere to enjoy the good mood.
  Happy: ['park', 'beach', 'viewpoint', 'waterfall', 'themePark', 'waterPark', 'zoo', 'aquarium', 'iceCream', 'marketplace'],
  // Burn it off, then cool down.
  Angry: ['gym', 'sportsCentre', 'swimmingPool', 'runningTrack', 'climbing', 'park', 'temple'],
  // Something new to do or see.
  Bored: ['cinema', 'museum', 'gallery', 'mall', 'bookshop', 'themePark', 'waterPark', 'zoo', 'aquarium', 'climbing', 'attraction', 'marketplace'],
  Hungry: ['restaurant', 'fastFood', 'foodCourt', 'marketplace', 'bakery', 'cafe'],
  // Nature, comfort, distraction and gentle exercise.
  Sad: [
    'park',
    'garden',
    'beach',
    'viewpoint',
    'waterfall',
    'cafe',
    'bakery',
    'iceCream',
    'massage',
    'marketplace',
    'museum',
    'gallery',
    'library',
    'bookshop',
    'cinema',
    'zoo',
    'aquarium',
    'themePark',
    'swimmingPool',
    'sportsCentre',
    'temple',
  ],
}

// `id` is the OpenStreetMap element, such as n123 for a node.
export type Place = { id: string; name: string; position: LatLng; kind: PlaceKindId }

const EARTH_RADIUS_KM = 6371

export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}
