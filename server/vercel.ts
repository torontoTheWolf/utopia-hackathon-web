import { createHandler, type Places } from './api.ts'
import { loadArea } from './area.ts'

// The live site's API, as Vercel functions: api/suggest.ts, api/route.ts and api/speak.ts each export this handler.
// It answers from the area saved in data/ (see area.ts), loaded on a function's first request that needs it. The keys
// for Claude and ElevenLabs are in the Vercel project's environment variables.

let places: Places | undefined

export default createHandler(() => (places ??= loadArea()))
