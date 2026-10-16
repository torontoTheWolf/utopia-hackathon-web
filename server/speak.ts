// ElevenLabs reads text aloud for the megaphone buttons, when ELEVENLABS_API_KEY is set. The app sends the text here and
// gets back MP3 audio, so the key stays on this machine. Without a key, or when ElevenLabs fails, speak returns null.

const API = 'https://api.elevenlabs.io/v1/text-to-speech'
// George, one of ElevenLabs' default voices. ELEVENLABS_VOICE_ID picks another, from the voice's page on elevenlabs.io.
const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb'
// The quickest model, at half the price per character of the others, and it can say Thai place names.
const MODEL = 'eleven_flash_v2_5'
const TIMEOUT_MS = 15_000

// Read after main.ts has loaded .env.local.
export function canSpeak(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY)
}

export async function speak(text: string): Promise<Buffer | null> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return null
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE
  try {
    const response = await fetch(`${API}/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300)
      console.error(`Places API: ElevenLabs responded ${response.status}${response.status === 401 ? ', so check ELEVENLABS_API_KEY' : ''} (${detail})`)
      return null
    }
    return Buffer.from(await response.arrayBuffer())
  } catch (error) {
    console.error(`Places API: couldn't reach ElevenLabs (${error instanceof Error ? error.message : String(error)})`)
    return null
  }
}
