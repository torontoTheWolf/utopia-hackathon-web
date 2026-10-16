import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import type { Emotion } from '../src/emotions.ts'
import { QUESTIONS, type Answer } from '../src/questions.ts'

// Claude Haiku picks the place that suits someone best from the few the router found, when ANTHROPIC_API_KEY is set.
// Without a key, or when Claude fails, is slow or declines, pickPlace returns null and the API suggests the closest.

const MODEL = 'claude-haiku-5-5'
// A pick takes 2 to 4 seconds. One try, so a stuck call falls back to the closest place within this.
const TIMEOUT_MS = 10_000

const SYSTEM = `You help someone choose where to go right now. You get how they feel, the option they chose for each of \
a few questions (null when they didn't answer), and the numbered places nearby they can reach, with each one's distance \
by road in km. Choose the one place that suits them best. How they feel and their answers matter more than \
distance, but when nothing else separates two places, prefer the closer one. Give the place's number and one short, \
warm sentence, spoken to them, on why it suits them. The app shows the place's name next to your sentence, so call \
the place "it" or "this park", "this café" and so on, never by its name or a translation of it. Don't mention distances, \
numbers, or the questions themselves. When they have already been offered some kinds of place, they asked for \
something else, so prefer a kind they haven't been offered yet, without mentioning the earlier ones.`

// The most places Claude chooses between. The schema stays the same from one request to the next, so the API compiles
// it once and reuses it, where a list of each request's place ids would cost a compile every time.
const MAX_PLACES = 8
const CHOICE = jsonSchemaOutputFormat(
  {
    type: 'object',
    properties: {
      place: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7, 8] },
      reason: { type: 'string' },
    },
    required: ['place', 'reason'],
    additionalProperties: false,
  } as const,
  // Sent as written: the SDK would otherwise move the enum into a description, and Claude could answer any number.
  { transform: false },
)

export type Candidate = { id: string; name: string; kind: string; roadKm: number }

export type Pick = { id: string; reason: string }

let client: Anthropic | null | undefined

// Made on first use, after main.ts has loaded .env.local.
function anthropic(): Anthropic | null {
  client ??= process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 }) : null
  return client
}

export function canPick(): boolean {
  return anthropic() !== null
}

// `offered` are the kinds of place already suggested to them, as when they press Try again.
export async function pickPlace(
  emotion: Emotion,
  answers: readonly (Answer | null)[],
  candidates: readonly Candidate[],
  offered: readonly string[],
): Promise<Pick | null> {
  const claude = anthropic()
  if (claude === null || candidates.length < 2) return null
  const places = candidates.slice(0, MAX_PLACES)
  const request = {
    feeling: emotion,
    answers: QUESTIONS.map(({ text, options }, index) => {
      const answer = answers[index] ?? null
      return { question: text, answer: answer === null ? null : options[answer - 1] }
    }),
    places: places.map(({ name, kind, roadKm }, index) => ({ number: index + 1, name, kind, roadKm })),
    alreadyOffered: offered,
  }
  try {
    const response = await claude.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low', format: CHOICE },
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(request) }],
    })
    const choice = response.stop_reason === 'end_turn' ? response.parsed_output : null
    // The schema allows every number up to MAX_PLACES, however many places there were.
    const place = choice === null ? undefined : places[choice.place - 1]
    if (choice === null || place === undefined) {
      console.error(`Places API: Claude stopped (${response.stop_reason}) without picking one of the places, so the closest is suggested.`)
      return null
    }
    return { id: place.id, reason: choice.reason.trim() }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('Places API: Claude rejected ANTHROPIC_API_KEY, so the closest place is suggested.')
    } else if (error instanceof Anthropic.APIError) {
      console.error(`Places API: Claude responded ${error.status ?? 'without a status'} (${error.message}), so the closest place is suggested.`)
    } else {
      console.error(`Places API: couldn't ask Claude (${error instanceof Error ? error.message : String(error)}), so the closest place is suggested.`)
    }
    return null
  }
}
