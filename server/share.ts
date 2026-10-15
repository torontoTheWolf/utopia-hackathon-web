import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Serves the places API from this machine to the live site: starts the API (unless it's already running), opens a
// Cloudflare quick tunnel to it, and points the live site's /api at the tunnel. A quick tunnel gets a new address each
// time, so this commits and pushes vercel.json with it, and Vercel redeploys.

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TUNNEL_ADDRESS = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

// If the API is already running, this copy says so and stops.
spawn(process.execPath, [fileURLToPath(new URL('./main.ts', import.meta.url))], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })

const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8787'], {
  stdio: ['ignore', 'ignore', 'pipe'],
})
tunnel.on('error', () => {
  console.error('Share: cloudflared is not installed. On Arch: sudo pacman -S cloudflared')
  process.exit(1)
})
tunnel.on('exit', (code) => {
  console.error(`Share: cloudflared stopped (exit code ${code}), so the live site can't reach the API.`)
  process.exit(1)
})
process.on('exit', () => tunnel.kill())
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => process.exit())

let address: string | null = null
let output = ''
// cloudflared logs to stderr. Only its errors are shown, and its first address is used.
tunnel.stderr.setEncoding('utf8').on('data', (chunk: string) => {
  output += chunk
  const lines = output.split('\n')
  output = lines.pop() ?? ''
  for (const line of lines) {
    if (line.includes(' ERR ')) console.error(`cloudflared: ${line}`)
    const found = address === null && line.match(TUNNEL_ADDRESS)
    if (found) {
      address = found[0]
      pointLiveSiteAt(address)
    }
  }
})

function pointLiveSiteAt(origin: string): void {
  console.log(`Share: the API is reachable at ${origin}/api`)
  const path = `${ROOT}vercel.json`
  const config = JSON.parse(readFileSync(path, 'utf8'))
  config.rewrites = [{ source: '/api/:path*', destination: `${origin}/api/:path*` }]
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`)
  try {
    // Naming the file commits only it, whatever else is staged.
    execFileSync('git', ['commit', '--quiet', '-m', "chore: point the live site's API at a new tunnel", '--', 'vercel.json'], {
      cwd: ROOT,
      stdio: 'inherit',
    })
    execFileSync('git', ['push', '--quiet'], { cwd: ROOT, stdio: 'inherit' })
    console.log('Share: pushed vercel.json. The live site uses this machine once Vercel finishes deploying, in a minute or two.')
  } catch {
    console.error('Share: committing or pushing vercel.json failed, so the live site still points at an old tunnel.')
  }
  console.log('Share: keep this running. Ctrl-C stops the tunnel.')
}
