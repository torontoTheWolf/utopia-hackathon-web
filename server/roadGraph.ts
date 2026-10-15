import { closeSync, openSync, readSync, statSync, writeSync } from 'node:fs'
import type { LatLng } from '../src/geo.ts'
import type { Route, TravelMode } from '../src/route.ts'
import { readOsmPbf, type Tags } from './osmPbf.ts'

// Every road segment is stored once in each direction it can be travelled. Coordinates are in units of 1e-7 degrees.
export type RoadGraph = {
  lat: Int32Array
  lng: Int32Array
  // The edges leaving node i are firstEdge[i] up to firstEdge[i + 1].
  firstEdge: Int32Array
  edgeTarget: Int32Array
  // FOOT and CAR bits, then the car speed in km/h divided by 2.
  edgeFlags: Uint8Array
  // FOOT and CAR bits for the modes a point can be snapped to the node for.
  snapModes: Uint8Array
  // Nodes bucketed into CELL-sized squares, row by row from the south-west corner.
  grid: { south: number; west: number; rows: number; cols: number }
  cellStart: Int32Array
  cellNodes: Int32Array
}

const FOOT = 1
const CAR = 2
const MODE_BITS: Record<TravelMode, number> = { foot: FOOT, car: CAR }

const CAR_KMH: { readonly [highway: string]: number } = {
  motorway: 90,
  motorway_link: 45,
  trunk: 80,
  trunk_link: 40,
  primary: 65,
  primary_link: 30,
  secondary: 55,
  secondary_link: 25,
  tertiary: 40,
  tertiary_link: 20,
  unclassified: 25,
  residential: 25,
  living_street: 10,
  service: 15,
  road: 20,
}
const MAX_CAR_METRES_PER_SECOND = Math.max(...Object.values(CAR_KMH)) / 3.6
const WALKABLE = new Set([
  ...Object.keys(CAR_KMH).filter((highway) => !highway.startsWith('motorway')),
  'track',
  'path',
  'footway',
  'pedestrian',
  'steps',
  'cycleway',
  'corridor',
])
const DENIED = new Set(['no', 'private', 'agricultural', 'forestry', 'emergency', 'delivery', 'use_sidepath'])

const UNITS_PER_DEGREE = 1e7
const METRES_PER_UNIT = ((Math.PI / 180) * 6_371_000) / UNITS_PER_DEGREE
// 0.01°, about 1.1 km. Finding the closest road looks at the 3×3 cells around a point, so it sees every node within
// SNAP_METRES, and the roads leaving them.
const CELL = 100_000
const SNAP_METRES = 1000
// Points aren't snapped to smaller islands of road, like a car park behind a private gate, where a search would be stuck.
const MIN_NETWORK_NODES = 1000
// Stops a search for an unreachable place before it walks the whole country.
const MAX_SETTLED = 1_000_000
// A route may join the road this much further from its end than the closest road does, such as across the street.
// More would let it cut across canals and buildings in a straight line.
const SLACK_METRES = 30
// Places are bucketed into squares of 0.005°, about 550 m, and each node looks for places in the 3×3 around it.
const PLACE_CELL = 0.005
// Finding the closest road skips cells whose nodes are all further away than the best so far by this much, since a road
// rarely runs further than this from both of its ends.
const EDGE_REACH_METRES = 200
const NEIGHBOURS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const
const WALK_METRES_PER_SECOND = 5 / 3.6

// Bump when buildRoadGraph or the file layout changes, so old caches are rebuilt.
const GRAPH_VERSION = 1
const ARRAY_NAMES = ['lat', 'lng', 'firstEdge', 'edgeTarget', 'edgeFlags', 'snapModes', 'cellStart', 'cellNodes'] as const

// The graph is cached next to the extract, and rebuilt when the extract changes.
export function loadRoadGraph(pbfPath: string): RoadGraph {
  const cachePath = `${pbfPath}.roads.bin`
  const { size, mtimeMs } = statSync(pbfPath)
  const key = JSON.stringify({ version: GRAPH_VERSION, size, mtimeMs })
  try {
    const cached = readGraph(cachePath, key)
    if (cached !== null) {
      console.log(`Places API: loaded the road graph from ${cachePath}`)
      return cached
    }
  } catch {
    // No usable cache, so build one.
  }
  console.log(`Places API: building the road graph from ${pbfPath}, which takes about a minute…`)
  const started = performance.now()
  const graph = buildRoadGraph(pbfPath)
  const seconds = Math.round((performance.now() - started) / 1000)
  console.log(`Places API: built a road graph of ${graph.edgeTarget.length} edges in ${seconds} s`)
  writeGraph(cachePath, key, graph)
  return graph
}

export function buildRoadGraph(pbfPath: string): RoadGraph {
  // Built in steps so that each step's working arrays can be freed before the next.
  const edges = readEdges(pbfPath)
  const snapModes = findSnapModes(edges)
  return { ...edges, snapModes, ...buildGrid(edges.lat, edges.lng, snapModes) }
}

type Edges = Pick<RoadGraph, 'lat' | 'lng' | 'firstEdge' | 'edgeTarget' | 'edgeFlags'>

function readEdges(pbfPath: string): Edges {
  const refs = new NumberList((length) => new Float64Array(length))
  const wayEnds = new NumberList((length) => new Int32Array(length))
  const forwardFlags = new NumberList((length) => new Uint8Array(length))
  const backwardFlags = new NumberList((length) => new Uint8Array(length))
  readOsmPbf(pbfPath, {
    way(_id, wayRefs, tags) {
      const flags = travelFlags(tags)
      if (flags === null) return
      for (const ref of wayRefs) refs.push(ref)
      wayEnds.push(refs.length)
      forwardFlags.push(flags.forward)
      backwardFlags.push(flags.backward)
    },
  })

  const refIds = refs.array()
  const ids = refIds.slice().sort()
  let unique = 0
  for (let i = 0; i < ids.length; i++) if (i === 0 || ids[i] !== ids[i - 1]) ids[unique++] = ids[i]
  const nodeIds = ids.subarray(0, unique)
  const nodeCount = nodeIds.length

  const lat = new Int32Array(nodeCount)
  const lng = new Int32Array(nodeCount)
  const located = new Uint8Array(nodeCount)
  readOsmPbf(pbfPath, {
    node(id, nodeLat, nodeLng) {
      const node = indexOf(nodeIds, id)
      if (node < 0) return
      lat[node] = Math.round(nodeLat * UNITS_PER_DEGREE)
      lng[node] = Math.round(nodeLng * UNITS_PER_DEGREE)
      located[node] = 1
    },
  })

  const refNodes = new Int32Array(refIds.length)
  for (let i = 0; i < refIds.length; i++) refNodes[i] = indexOf(nodeIds, refIds[i])
  const ends = wayEnds.array()
  const forward = forwardFlags.array()
  const backward = backwardFlags.array()
  const eachEdge = (visit: (from: number, to: number, flags: number) => void) => {
    let start = 0
    for (let way = 0; way < ends.length; way++) {
      for (let i = start; i < ends[way] - 1; i++) {
        const a = refNodes[i]
        const b = refNodes[i + 1]
        if (a === b || !located[a] || !located[b]) continue
        if (forward[way] & (FOOT | CAR)) visit(a, b, forward[way])
        if (backward[way] & (FOOT | CAR)) visit(b, a, backward[way])
      }
      start = ends[way]
    }
  }

  const firstEdge = new Int32Array(nodeCount + 1)
  eachEdge((from) => firstEdge[from + 1]++)
  for (let node = 0; node < nodeCount; node++) firstEdge[node + 1] += firstEdge[node]
  const edgeTarget = new Int32Array(firstEdge[nodeCount])
  const edgeFlags = new Uint8Array(firstEdge[nodeCount])
  const nextEdge = firstEdge.slice(0, nodeCount)
  eachEdge((from, to, flags) => {
    const edge = nextEdge[from]++
    edgeTarget[edge] = to
    edgeFlags[edge] = flags
  })

  return { lat, lng, firstEdge, edgeTarget, edgeFlags }
}

// A point on the road leaving node `from` for node `to` by `edge`, `along` the way from one to the other, and how far
// it is from the point it was found for.
type RoadPoint = { edge: number; from: number; to: number; along: number; metres: number }

export type Router = {
  route: (from: LatLng, to: LatLng, mode: TravelMode) => Route | null
  // The index of the target that is closest by road for the mode, with each target's distance multiplied by its
  // factor, or null when none can be reached.
  nearest: (from: LatLng, targets: readonly { position: LatLng; factor: number }[], mode: TravelMode) => number | null
}

// Routes start and end on the closest point of the closest road, and follow roads and paths in between.
export function createRouter(graph: RoadGraph): Router {
  const { lat, lng, firstEdge, edgeTarget, edgeFlags, snapModes, grid, cellStart, cellNodes } = graph
  const nodeCount = lat.length
  // Reused by every search. A node's cost and parent only count when its stamp matches the current search.
  const cost = new Float32Array(nodeCount)
  const parent = new Int32Array(nodeCount)
  const stamp = new Uint32Array(nodeCount)
  const heap = new MinHeap()
  let search = 0
  // How far each place is from its closest road, by mode, kept between searches.
  const closestRoadMetres = new Map<string, number>()

  const positionOf = (node: number): LatLng => ({ lat: lat[node] / UNITS_PER_DEGREE, lng: lng[node] / UNITS_PER_DEGREE })
  // Over the few kilometres of a route the earth is flat enough to measure with one longitude scale.
  const metres = (a: number, b: number, lngScale: number) =>
    Math.hypot((lng[a] - lng[b]) * lngScale, lat[a] - lat[b]) * METRES_PER_UNIT
  const metresTo = (node: number, point: LatLng, lngScale: number) =>
    Math.hypot((lng[node] - point.lng * UNITS_PER_DEGREE) * lngScale, lat[node] - point.lat * UNITS_PER_DEGREE) * METRES_PER_UNIT
  const pointAlong = (a: number, b: number, along: number): LatLng => ({
    lat: (lat[a] + (lat[b] - lat[a]) * along) / UNITS_PER_DEGREE,
    lng: (lng[a] + (lng[b] - lng[a]) * along) / UNITS_PER_DEGREE,
  })

  // Where `point` comes closest to the road from node a to node b. Reused, so read it before projecting again.
  const projection = { along: 0, metres: 0 }
  const project = (a: number, b: number, point: LatLng, lngScale: number) => {
    const dx = (lng[b] - lng[a]) * lngScale
    const dy = lat[b] - lat[a]
    const px = (point.lng * UNITS_PER_DEGREE - lng[a]) * lngScale
    const py = point.lat * UNITS_PER_DEGREE - lat[a]
    const lengthSquared = dx * dx + dy * dy
    const along = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (px * dx + py * dy) / lengthSquared))
    projection.along = along
    projection.metres = Math.hypot(px - along * dx, py - along * dy) * METRES_PER_UNIT
    return projection
  }

  // The closest point within SNAP_METRES on a road for the mode, between nodes the mode can be snapped to.
  const closestRoadPoint = (point: LatLng, bit: number, lngScale: number): RoadPoint | null => {
    const pointLat = point.lat * UNITS_PER_DEGREE
    const pointLng = point.lng * UNITS_PER_DEGREE
    const row = Math.floor((pointLat - grid.south) / CELL)
    const col = Math.floor((pointLng - grid.west) / CELL)
    let best: RoadPoint | null = null
    // The point's own cell first, so that the others can mostly be skipped.
    for (const [r, c] of [[row, col], ...NEIGHBOURS.map(([dr, dc]) => [row + dr, col + dc])]) {
      if (r < 0 || r >= grid.rows || c < 0 || c >= grid.cols) continue
      const south = grid.south + r * CELL
      const west = grid.west + c * CELL
      const gap = Math.hypot(
        Math.max(south - pointLat, 0, pointLat - south - CELL),
        Math.max(west - pointLng, 0, pointLng - west - CELL) * lngScale,
      )
      if (gap * METRES_PER_UNIT - EDGE_REACH_METRES >= (best?.metres ?? SNAP_METRES)) continue
      const cell = r * grid.cols + c
      for (let slot = cellStart[cell]; slot < cellStart[cell + 1]; slot++) {
        const node = cellNodes[slot]
        if (!(snapModes[node] & bit)) continue
        for (let edge = firstEdge[node]; edge < firstEdge[node + 1]; edge++) {
          const next = edgeTarget[edge]
          if (!(edgeFlags[edge] & bit) || !(snapModes[next] & bit)) continue
          const { along, metres: away } = project(node, next, point, lngScale)
          if (away < (best?.metres ?? SNAP_METRES)) best = { edge, from: node, to: next, along, metres: away }
        }
      }
    }
    return best
  }

  const reverseEdge = (from: number, to: number, bit: number) => {
    for (let edge = firstEdge[to]; edge < firstEdge[to + 1]; edge++) {
      if (edgeTarget[edge] === from && edgeFlags[edge] & bit) return edge
    }
    return -1
  }

  type StepCost = (metres: number, flags: number) => number

  // From a point on a road, a search sets off along it to its end, and back to its start if the road goes both ways.
  const seedsFrom = (start: RoadPoint, bit: number, stepCost: StepCost, lngScale: number) => {
    const length = metres(start.from, start.to, lngScale)
    const seeds = [{ node: start.to, cost: stepCost(length * (1 - start.along), edgeFlags[start.edge]) }]
    const back = reverseEdge(start.from, start.to, bit)
    if (back >= 0) seeds.push({ node: start.from, cost: stepCost(length * start.along, edgeFlags[back]) })
    return seeds
  }

  // Reaches nodes in order of cost plus `toGoal`, an estimate of the cost left that is never too high. `reach` sees each
  // node once at its lowest cost, and returns true to stop.
  const explore = (
    seeds: readonly { node: number; cost: number }[],
    bit: number,
    lngScale: number,
    stepCost: StepCost,
    toGoal: (node: number) => number,
    reach: (node: number, cost: number) => boolean,
  ): void => {
    search++
    heap.clear()
    for (const seed of seeds) {
      const seedCost = Math.fround(seed.cost)
      if (stamp[seed.node] === search && seedCost >= cost[seed.node]) continue
      stamp[seed.node] = search
      cost[seed.node] = seedCost
      parent[seed.node] = -1
      heap.push(seedCost + toGoal(seed.node), seed.node, seedCost)
    }
    for (let settled = 0; heap.size > 0 && settled < MAX_SETTLED; ) {
      const { node, cost: reached } = heap.pop()
      if (reached > cost[node]) continue
      if (reach(node, reached)) return
      settled++
      for (let edge = firstEdge[node]; edge < firstEdge[node + 1]; edge++) {
        const flags = edgeFlags[edge]
        if (!(flags & bit)) continue
        const next = edgeTarget[edge]
        const total = Math.fround(reached + stepCost(metres(node, next, lngScale), flags))
        if (stamp[next] === search && total >= cost[next]) continue
        stamp[next] = search
        cost[next] = total
        parent[next] = node
        heap.push(total + toGoal(next), next, total)
      }
    }
  }

  // The nodes the last search took to `end`, from where it set off.
  const nodesTo = (end: number) => {
    const nodes: number[] = []
    for (let at = end; at !== -1; at = parent[at]) nodes.push(at)
    return nodes.reverse()
  }

  // How far along the start's road a point on the same road is, or null when it's on another road.
  const alongSameRoad = (start: RoadPoint, other: { from: number; to: number; along: number }) => {
    if (other.from === start.from && other.to === start.to) return other.along
    if (other.from === start.to && other.to === start.from) return 1 - other.along
    return null
  }

  // The cost of travelling along the start's road to `along` without leaving it, or Infinity if the mode can't.
  const costAlongStartRoad = (start: RoadPoint, along: number, bit: number, stepCost: StepCost, lngScale: number) => {
    const edge = along >= start.along ? start.edge : reverseEdge(start.from, start.to, bit)
    return edge < 0 ? Infinity : stepCost(metres(start.from, start.to, lngScale) * Math.abs(along - start.along), edgeFlags[edge])
  }

  return {
    route(from, to, mode) {
      const bit = MODE_BITS[mode]
      const lngScale = Math.cos((from.lat * Math.PI) / 180)
      const start = closestRoadPoint(from, bit, lngScale)
      const end = closestRoadPoint(to, bit, lngScale)
      if (start === null || end === null) return null
      // Walks are the shortest, in metres, and drives the quickest, in seconds at each road's speed. The last stretch,
      // from the road to `to`, is on foot.
      const stepCost: StepCost = mode === 'foot' ? (length) => length : (length, flags) => length / (((flags >> 2) * 2) / 3.6)
      const lastStretch = mode === 'foot' ? (length: number) => length : (length: number) => length / WALK_METRES_PER_SECOND
      const speed = mode === 'foot' ? 1 : MAX_CAR_METRES_PER_SECOND
      const toGoal = (node: number) => metresTo(node, to, lngScale) / speed

      let best = { cost: Infinity, node: -1, joint: pointAlong(end.from, end.to, end.along) }
      const endAlong = alongSameRoad(start, end)
      if (endAlong !== null) best.cost = costAlongStartRoad(start, endAlong, bit, stepCost, lngScale) + lastStretch(end.metres)
      explore(seedsFrom(start, bit, stepCost, lngScale), bit, lngScale, stepCost, toGoal, (node, reached) => {
        // Nothing reached from here on can do better, since toGoal never overestimates.
        if (reached + toGoal(node) >= best.cost) return true
        for (let edge = firstEdge[node]; edge < firstEdge[node + 1]; edge++) {
          if (!(edgeFlags[edge] & bit)) continue
          const next = edgeTarget[edge]
          const { along, metres: away } = project(node, next, to, lngScale)
          if (away > end.metres + SLACK_METRES) continue
          const total = reached + stepCost(metres(node, next, lngScale) * along, edgeFlags[edge]) + lastStretch(away)
          if (total < best.cost) best = { cost: total, node, joint: pointAlong(node, next, along) }
        }
        return false
      })
      if (best.cost === Infinity) return null

      const nodes = best.node < 0 ? [] : nodesTo(best.node).map(positionOf)
      const path = [from, pointAlong(start.from, start.to, start.along), ...nodes, best.joint, to]
      let distance = 0
      for (let i = 1; i < path.length; i++) distance += flatMetres(path[i - 1], path[i], lngScale)
      return { distanceKm: distance / 1000, path }
    },

    nearest(from, targets, mode) {
      const bit = MODE_BITS[mode]
      const lngScale = Math.cos((from.lat * Math.PI) / 180)
      const start = closestRoadPoint(from, bit, lngScale)
      if (start === null || targets.length === 0) return null
      // Closest by distance in either mode, so the order matches the distances shown.
      const stepCost: StepCost = (length) => length
      const cellKey = (row: number, col: number) => row * 100_000 + col
      const buckets = new Map<number, number[]>()
      targets.forEach(({ position }, index) => {
        const key = cellKey(Math.floor(position.lat / PLACE_CELL), Math.floor(position.lng / PLACE_CELL))
        const bucket = buckets.get(key)
        if (bucket === undefined) buckets.set(key, [index])
        else bucket.push(index)
      })
      const roadMetres = (target: number) => {
        const { position } = targets[target]
        const key = `${bit},${position.lat},${position.lng}`
        let found = closestRoadMetres.get(key)
        if (found === undefined) {
          found = closestRoadPoint(position, bit, lngScale)?.metres ?? Infinity
          closestRoadMetres.set(key, found)
        }
        return found
      }
      const minFactor = Math.min(...targets.map(({ factor }) => factor))
      let best = { cost: Infinity, target: -1 }
      // `away` is how far the target is from the road where the trip would leave it.
      const consider = (target: number, length: number, away: number) => {
        const total = (length + away) * targets[target].factor
        if (total >= best.cost) return
        // A road this close will do whichever road is closest, which is slower to find.
        if (away > SLACK_METRES && away > roadMetres(target) + SLACK_METRES) return
        best = { cost: total, target }
      }

      // Targets on the road you're on, reached along it.
      const startPosition = pointAlong(start.from, start.to, start.along)
      const startRow = Math.floor(startPosition.lat / PLACE_CELL)
      const startCol = Math.floor(startPosition.lng / PLACE_CELL)
      for (let r = startRow - 1; r <= startRow + 1; r++) {
        for (let c = startCol - 1; c <= startCol + 1; c++) {
          for (const target of buckets.get(cellKey(r, c)) ?? []) {
            const { along, metres: away } = project(start.from, start.to, targets[target].position, lngScale)
            consider(target, costAlongStartRoad(start, along, bit, stepCost, lngScale), away)
          }
        }
      }

      explore(seedsFrom(start, bit, stepCost, lngScale), bit, lngScale, stepCost, () => 0, (node, reached) => {
        if (reached * minFactor >= best.cost) return true
        const row = Math.floor(lat[node] / UNITS_PER_DEGREE / PLACE_CELL)
        const col = Math.floor(lng[node] / UNITS_PER_DEGREE / PLACE_CELL)
        for (let r = row - 1; r <= row + 1; r++) {
          for (let c = col - 1; c <= col + 1; c++) {
            for (const target of buckets.get(cellKey(r, c)) ?? []) {
              for (let edge = firstEdge[node]; edge < firstEdge[node + 1]; edge++) {
                if (!(edgeFlags[edge] & bit)) continue
                const next = edgeTarget[edge]
                const { along, metres: away } = project(node, next, targets[target].position, lngScale)
                consider(target, reached + metres(node, next, lngScale) * along, away)
              }
            }
          }
        }
        return false
      })
      return best.target < 0 ? null : best.target
    },
  }
}

function travelFlags(tags: Tags): { forward: number; backward: number } | null {
  const { highway } = tags
  if (highway === undefined) return null
  const foot = WALKABLE.has(highway) && allowed(tags, ['foot', 'access']) ? FOOT : 0
  const carKmh = CAR_KMH[highway]
  const car = carKmh !== undefined && allowed(tags, ['motorcar', 'motor_vehicle', 'vehicle', 'access'])
  if (!foot && !car) return null
  const direction = car ? carDirection(tags) : 'none'
  const speed = car ? Math.round(carKmh / 2) << 2 : 0
  return {
    forward: foot | (direction === 'forward' || direction === 'both' ? CAR : 0) | speed,
    backward: foot | (direction === 'backward' || direction === 'both' ? CAR : 0) | speed,
  }
}

// The most specific access tag present decides.
function allowed(tags: Tags, keys: readonly string[]): boolean {
  for (const key of keys) {
    const value = tags[key]
    if (value !== undefined) return !DENIED.has(value)
  }
  return true
}

function carDirection(tags: Tags): 'both' | 'forward' | 'backward' | 'none' {
  const { oneway } = tags
  if (oneway === 'yes' || oneway === 'true' || oneway === '1') return 'forward'
  if (oneway === '-1' || oneway === 'reverse') return 'backward'
  if (oneway === 'reversible' || oneway === 'alternating') return 'none'
  if (oneway === 'no') return 'both'
  const impliedOneway =
    tags.junction === 'roundabout' || tags.junction === 'circular' || tags.highway === 'motorway' || tags.highway === 'motorway_link'
  return impliedOneway ? 'forward' : 'both'
}

// Marks, for each mode, the nodes in a strongly connected network of at least MIN_NETWORK_NODES: one where every node
// can reach every other, one-way streets included. This is Tarjan's algorithm, with its recursion kept in arrays.
function findSnapModes({ firstEdge, edgeTarget, edgeFlags }: Edges): Uint8Array {
  const nodeCount = firstEdge.length - 1
  const snapModes = new Uint8Array(nodeCount)
  const order = new Int32Array(nodeCount)
  const low = new Int32Array(nodeCount)
  const open = new Uint8Array(nodeCount)
  const stack = new Int32Array(nodeCount)
  const pathNodes = new Int32Array(nodeCount)
  const pathEdges = new Int32Array(nodeCount)
  for (const bit of [FOOT, CAR]) {
    order.fill(-1)
    let visited = 0
    let stackSize = 0
    for (let root = 0; root < nodeCount; root++) {
      if (order[root] !== -1) continue
      let depth = 0
      const enter = (node: number) => {
        order[node] = low[node] = visited++
        stack[stackSize++] = node
        open[node] = 1
        pathNodes[depth] = node
        pathEdges[depth++] = firstEdge[node]
      }
      enter(root)
      while (depth > 0) {
        const node = pathNodes[depth - 1]
        let edge = pathEdges[depth - 1]
        while (edge < firstEdge[node + 1] && !((edgeFlags[edge] & bit) && order[edgeTarget[edge]] === -1)) {
          if (edgeFlags[edge] & bit && open[edgeTarget[edge]]) low[node] = Math.min(low[node], order[edgeTarget[edge]])
          edge++
        }
        if (edge < firstEdge[node + 1]) {
          pathEdges[depth - 1] = edge + 1
          enter(edgeTarget[edge])
          continue
        }
        if (low[node] === order[node]) {
          let first = stackSize
          while (stack[--first] !== node);
          const big = stackSize - first >= MIN_NETWORK_NODES
          for (let i = first; i < stackSize; i++) {
            open[stack[i]] = 0
            if (big) snapModes[stack[i]] |= bit
          }
          stackSize = first
        }
        depth--
        if (depth > 0) low[pathNodes[depth - 1]] = Math.min(low[pathNodes[depth - 1]], low[node])
      }
    }
  }
  return snapModes
}

function buildGrid(lat: Int32Array, lng: Int32Array, snapModes: Uint8Array) {
  const routable = (node: number) => snapModes[node] !== 0
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  for (let node = 0; node < lat.length; node++) {
    if (!routable(node)) continue
    south = Math.min(south, lat[node])
    north = Math.max(north, lat[node])
    west = Math.min(west, lng[node])
    east = Math.max(east, lng[node])
  }
  const grid = { south, west, rows: Math.floor((north - south) / CELL) + 1, cols: Math.floor((east - west) / CELL) + 1 }
  const cellOf = (node: number) => Math.floor((lat[node] - south) / CELL) * grid.cols + Math.floor((lng[node] - west) / CELL)
  const cellStart = new Int32Array(grid.rows * grid.cols + 1)
  for (let node = 0; node < lat.length; node++) if (routable(node)) cellStart[cellOf(node) + 1]++
  for (let cell = 0; cell < grid.rows * grid.cols; cell++) cellStart[cell + 1] += cellStart[cell]
  const cellNodes = new Int32Array(cellStart[grid.rows * grid.cols])
  const nextSlot = cellStart.slice()
  for (let node = 0; node < lat.length; node++) if (routable(node)) cellNodes[nextSlot[cellOf(node)]++] = node
  return { grid, cellStart, cellNodes }
}

function flatMetres(a: LatLng, b: LatLng, lngScale: number): number {
  return Math.hypot((a.lng - b.lng) * lngScale, a.lat - b.lat) * UNITS_PER_DEGREE * METRES_PER_UNIT
}

function indexOf(sorted: Float64Array, value: number): number {
  let low = 0
  let high = sorted.length - 1
  while (low <= high) {
    const middle = (low + high) >>> 1
    if (sorted[middle] < value) low = middle + 1
    else if (sorted[middle] > value) high = middle - 1
    else return middle
  }
  return -1
}

type NumberArray = Float64Array | Int32Array | Uint8Array

// A typed array that grows as values are pushed.
class NumberList<T extends NumberArray> {
  length = 0
  private values: T
  private readonly make: (length: number) => T

  constructor(make: (length: number) => T) {
    this.make = make
    this.values = make(1 << 16)
  }

  push(value: number): void {
    if (this.length === this.values.length) {
      const bigger = this.make(this.values.length * 2)
      bigger.set(this.values)
      this.values = bigger
    }
    this.values[this.length++] = value
  }

  array(): T {
    return this.values.subarray(0, this.length) as T
  }
}

// A binary min-heap of nodes keyed by estimated total cost. Stale entries are skipped when popped.
class MinHeap {
  size = 0
  private keys = new Float64Array(1 << 16)
  private nodes = new Int32Array(1 << 16)
  private costs = new Float32Array(1 << 16)

  clear(): void {
    this.size = 0
  }

  push(key: number, node: number, cost: number): void {
    if (this.size === this.keys.length) {
      const grow = <T extends Float64Array | Int32Array | Float32Array>(old: T, make: (length: number) => T) => {
        const bigger = make(old.length * 2)
        bigger.set(old)
        return bigger
      }
      this.keys = grow(this.keys, (length) => new Float64Array(length))
      this.nodes = grow(this.nodes, (length) => new Int32Array(length))
      this.costs = grow(this.costs, (length) => new Float32Array(length))
    }
    let at = this.size++
    while (at > 0) {
      const up = (at - 1) >> 1
      if (this.keys[up] <= key) break
      this.move(up, at)
      at = up
    }
    this.keys[at] = key
    this.nodes[at] = node
    this.costs[at] = cost
  }

  pop(): { node: number; cost: number } {
    const top = { node: this.nodes[0], cost: this.costs[0] }
    const last = --this.size
    const key = this.keys[last]
    let at = 0
    for (;;) {
      let child = 2 * at + 1
      if (child >= last) break
      if (child + 1 < last && this.keys[child + 1] < this.keys[child]) child++
      if (this.keys[child] >= key) break
      this.move(child, at)
      at = child
    }
    this.keys[at] = key
    this.nodes[at] = this.nodes[last]
    this.costs[at] = this.costs[last]
    return top
  }

  private move(from: number, to: number): void {
    this.keys[to] = this.keys[from]
    this.nodes[to] = this.nodes[from]
    this.costs[to] = this.costs[from]
  }
}

// The cache file is a length-prefixed JSON header followed by each array's bytes, each starting on an 8-byte boundary.
function writeGraph(path: string, key: string, graph: RoadGraph): void {
  const arrays = ARRAY_NAMES.map((name) => graph[name])
  const header = Buffer.from(JSON.stringify({ key, grid: graph.grid, lengths: arrays.map((array) => array.length) }))
  const file = openSync(path, 'w')
  try {
    const prefix = Buffer.alloc(4)
    prefix.writeUInt32LE(header.length)
    let offset = writeSync(file, prefix) + writeSync(file, header)
    for (const array of arrays) {
      offset += writeSync(file, Buffer.alloc(padding(offset)))
      offset += writeSync(file, new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
    }
  } finally {
    closeSync(file)
  }
}

function readGraph(path: string, key: string): RoadGraph | null {
  const file = openSync(path, 'r')
  try {
    const prefix = Buffer.alloc(4)
    readSync(file, prefix, 0, 4, 0)
    const header = Buffer.alloc(prefix.readUInt32LE())
    readSync(file, header, 0, header.length, 4)
    const parsed: { key: string; grid: RoadGraph['grid']; lengths: number[] } = JSON.parse(header.toString())
    if (parsed.key !== key) return null
    let offset = 4 + header.length
    const read = <T extends NumberArray>(length: number, make: (length: number) => T): T => {
      offset += padding(offset)
      const array = make(length)
      const bytes = new Uint8Array(array.buffer)
      // A single read is capped at 2 GiB, so large arrays come in pieces.
      for (let done = 0; done < bytes.length; ) {
        const count = readSync(file, bytes, done, Math.min(bytes.length - done, 1 << 30), offset + done)
        if (count === 0) throw new Error('The road graph cache is cut short')
        done += count
      }
      offset += bytes.length
      return array
    }
    const [lat, lng, firstEdge, edgeTarget, edgeFlags, snapModes, cellStart, cellNodes] = parsed.lengths
    return {
      lat: read(lat, (length) => new Int32Array(length)),
      lng: read(lng, (length) => new Int32Array(length)),
      firstEdge: read(firstEdge, (length) => new Int32Array(length)),
      edgeTarget: read(edgeTarget, (length) => new Int32Array(length)),
      edgeFlags: read(edgeFlags, (length) => new Uint8Array(length)),
      snapModes: read(snapModes, (length) => new Uint8Array(length)),
      grid: parsed.grid,
      cellStart: read(cellStart, (length) => new Int32Array(length)),
      cellNodes: read(cellNodes, (length) => new Int32Array(length)),
    }
  } finally {
    closeSync(file)
  }
}

function padding(offset: number): number {
  return (8 - (offset % 8)) % 8
}
