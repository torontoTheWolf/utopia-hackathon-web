import { useEffect, useRef, useState } from 'react'

// A megaphone that sits beside some text and reads it aloud with ElevenLabs, through the places API, which keeps the key.
// Pressing it again stops. Until ELEVENLABS_API_KEY is set, the API answers 503, and the megaphone fades and says so.
// Give it a `key` of its text, so a new text starts afresh and stops the old one.

const SPEAK_API = '/api/speak'

type State = 'idle' | 'loading' | 'playing' | 'unavailable' | 'failed'

const LABELS: Record<State, string> = {
  idle: 'Read aloud',
  loading: 'Stop reading aloud',
  playing: 'Stop reading aloud',
  unavailable: "Reading aloud isn't set up yet",
  failed: "Couldn't read it aloud. Press to try again",
}

export default function SpeakButton({ text }: { text: string }) {
  const [state, setState] = useState<State>('idle')
  const stop = useRef<(() => void) | null>(null)

  // Stops when the megaphone goes away, as when the pop-up closes.
  useEffect(() => () => stop.current?.(), [])

  const play = async () => {
    if (stop.current !== null) return stop.current()
    // Made during the click, so that Safari lets it play when the audio arrives a moment later.
    const context = new AudioContext()
    const controller = new AbortController()
    let done = false
    const finish = (next: State) => {
      if (done) return
      done = true
      controller.abort()
      void context.close()
      stop.current = null
      setState(next)
    }
    stop.current = () => finish('idle')
    setState('loading')
    try {
      const response = await fetch(`${SPEAK_API}?${new URLSearchParams({ text })}`, { signal: controller.signal })
      if (response.status === 503) return finish('unavailable')
      if (!response.ok) throw new Error(`Places API responded ${response.status}`)
      const audio = await context.decodeAudioData(await response.arrayBuffer())
      if (done) return
      const source = context.createBufferSource()
      source.buffer = audio
      source.connect(context.destination)
      source.onended = () => finish('idle')
      source.start()
      setState('playing')
    } catch {
      finish('failed')
    }
  }

  return (
    <button
      className={`speak is-${state}`}
      type="button"
      aria-label={LABELS[state]}
      title={LABELS[state]}
      onClick={() => void play()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <g transform="rotate(-14 12 12)" fill="currentColor">
          <path d="M7.2 14.6l1.3 4.6a1.1 1.1 0 0 0 1.06.8h.5a1.1 1.1 0 0 0 1.05-1.4l-1-3.4z" />
          <rect x="1.5" y="9.4" width="3" height="5.2" rx="1.2" />
          <path d="M3.6 9.6l9.6-4.9a1 1 0 0 1 1.45.9v12.8a1 1 0 0 1-1.45.9L3.6 14.4z" />
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path className="speak-wave" d="M17.6 9.4a3.4 3.4 0 0 1 0 5.2" />
            <path className="speak-wave" d="M20.2 6.9a7 7 0 0 1 0 10.2" />
          </g>
        </g>
      </svg>
    </button>
  )
}
