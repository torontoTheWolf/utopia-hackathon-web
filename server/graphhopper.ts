import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LatLng } from '../src/geo.ts'
import { distanceKm } from '../src/places.ts'
import type { Route, TravelMode } from '../src/route.ts'

// GraphHopper (https://github.com/graphhopper/graphhopper) routes with turn restrictions, barriers and access rules, and
// gives turn-by-turn directions. It runs as a Java server next to the API, which uses its own router until GraphHopper
// is ready, and instead of it when Java isn't installed.

export type GraphHopper = {
  // Resolves to null when GraphHopper isn't ready, or finds no route.
  route: (from: LatLng, to: LatLng, mode: TravelMode, locale: string) => Promise<Route | null>
}

const VERSION = '11.1'
const JAR_URL = `https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/${VERSION}/graphhopper-web-${VERSION}.jar`
const JAR_SHA256 = '8462f758d9ea49edaded557cec5c687a0a24f004ec371cd4daaeb0534824ea33'
const BASE_URL = 'http://127.0.0.1:8989'
const CONFIG = fileURLToPath(new URL('./graphhopper.yml', import.meta.url))
// Bump when graphhopper.yml changes in a way that needs a new import.
const GRAPH_VERSION = 1
// The import needs about 6 GB.
const MAX_HEAP = '7g'
// Like the API's own router, a route's ends may be at most this far from a road.
const SNAP_KM = 1

export function startGraphHopper(pbfPath: string): GraphHopper {
  const folder = join(dirname(pbfPath), 'graphhopper')
  const { size, mtimeMs } = statSync(pbfPath)
  const graph = join(folder, `graph-${basename(pbfPath)}-${size}-${Math.round(mtimeMs)}-v${GRAPH_VERSION}`)
  let ready = false

  const launch = async () => {
    // One left running by an API that couldn't stop it will do.
    if (await isHealthy()) {
      ready = true
      return
    }
    mkdirSync(folder, { recursive: true })
    const jar = await ensureJar(folder)
    const template = readFileSync(CONFIG, 'utf8')
    const paths = `graphhopper:\n  datareader.file: ${JSON.stringify(pbfPath)}\n  graph.location: ${JSON.stringify(graph)}\n`
    writeFileSync(join(folder, 'config.yml'), template.replace('graphhopper:\n', paths))
    console.log(
      existsSync(graph)
        ? 'GraphHopper: starting, which takes about half a minute. Until then routes come from the built-in router.'
        : `GraphHopper: importing ${pbfPath}, which takes about 15 minutes. Until then routes come from the built-in router.`,
    )
    const java = ['java', `-Xmx${MAX_HEAP}`, '-jar', jar, 'server', 'config.yml']
    // setpriv stops GraphHopper when the API exits, however it exits.
    const command = spawnSync('setpriv', ['--version']).error ? java : ['setpriv', '--pdeathsig', 'TERM', ...java]
    const output = openSync(join(folder, 'graphhopper.out'), 'w')
    const child = spawn(command[0], command.slice(1), { cwd: folder, stdio: ['ignore', output, output] })
    let running = true
    child.on('error', () => {
      running = false
      console.error('GraphHopper: Java is not installed, so routes come from the built-in router.')
    })
    child.on('exit', (code) => {
      running = false
      ready = false
      console.error(`GraphHopper: stopped (exit code ${code}), so routes come from the built-in router. See ${folder}/graphhopper.log.`)
    })
    process.on('exit', () => child.kill())
    while (running) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      if (await isHealthy()) {
        ready = true
        console.log('GraphHopper: ready')
        return
      }
    }
  }
  launch().catch((error: unknown) => console.error(`GraphHopper: couldn't start (${error}), so routes come from the built-in router.`))

  return {
    async route(from, to, mode, locale) {
      if (!ready) return null
      const params = new URLSearchParams({ profile: mode, points_encoded: 'false', instructions: 'true', locale })
      params.append('point', `${from.lat},${from.lng}`)
      params.append('point', `${to.lat},${to.lng}`)
      const response = await fetch(`${BASE_URL}/route?${params}`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
      if (!response?.ok) return null
      const path = ((await response.json()) as GraphHopperResponse).paths?.[0]
      const coordinates = path?.points?.coordinates ?? []
      if (path === undefined || coordinates.length < 2) return null
      const roadPath = coordinates.map(([lng, lat]) => ({ lat, lng }))
      // GraphHopper's route runs between the closest points on roads, so the stretches from and to them are added.
      const onto = distanceKm(from, roadPath[0])
      const off = distanceKm(roadPath.at(-1)!, to)
      if (onto > SNAP_KM || off > SNAP_KM) return null
      return {
        distanceKm: path.distance / 1000 + onto + off,
        path: [from, ...roadPath, to],
        steps: (path.instructions ?? []).map(({ text, distance }) => ({ text, distanceKm: distance / 1000 })),
      }
    },
  }
}

type GraphHopperResponse = {
  paths?: {
    distance: number
    points?: { coordinates: [number, number][] }
    instructions?: { text: string; distance: number }[]
  }[]
}

async function isHealthy(): Promise<boolean> {
  const response = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(1000) }).catch(() => null)
  return response?.ok ?? false
}

// Downloads GraphHopper from Maven Central the first time, and checks it is the expected file.
async function ensureJar(folder: string): Promise<string> {
  const jar = join(folder, `graphhopper-web-${VERSION}.jar`)
  if (existsSync(jar)) return jar
  console.log(`GraphHopper: downloading ${JAR_URL}`)
  const response = await fetch(JAR_URL)
  if (!response.ok) throw new Error(`Maven Central responded ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (hash !== JAR_SHA256) throw new Error(`the download's SHA-256 is ${hash}, not ${JAR_SHA256}`)
  writeFileSync(`${jar}.part`, bytes)
  renameSync(`${jar}.part`, jar)
  return jar
}
