import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { defineConfig, type HttpServer, type Plugin } from 'vite'

// server/main.ts serves the places API on this address.
const proxy = { '/api': 'http://127.0.0.1:8787' }

// Runs the places API next to the dev and preview servers, and stops it when they close or restart.
function placesApi(): Plugin {
  const start = (root: string, httpServer: HttpServer | null) => {
    if (httpServer === null) return
    // The IPC channel lets the API notice when Vite exits, however it exits.
    const api = spawn(process.execPath, [join(root, 'server/main.ts')], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
    httpServer.once('close', () => api.kill())
  }
  return {
    name: 'places-api',
    configureServer: (server) => start(server.config.root, server.httpServer),
    configurePreviewServer: (server) => start(server.config.root, server.httpServer),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), placesApi()],
  server: { proxy },
  preview: { proxy },
})
