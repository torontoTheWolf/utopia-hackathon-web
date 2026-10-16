import { useEffect, useRef, useState, type ReactNode } from 'react'
import angryFace from './assets/ANGRY.png'
import boredFace from './assets/BORDEM.png'
import happyFace from './assets/HAPPY.png'
import hungryFace from './assets/HUNGER.png'
import sadFace from './assets/SAD.png'
import { burstConfetti } from './confetti'
import { EMOTIONS, type Emotion } from './emotions'
import { useCurrentPosition } from './geo'
import GpsMap from './GpsMap'
import { MAPS_APPS, preferredMapsApp } from './maps'
import { PLACE_KINDS } from './places'
import { ANSWERS, QUESTIONS, type Answer, type Question } from './questions'
import type { TravelMode } from './route'
import { useRoute } from './useRoute'
import { useSpot, type Suggestion } from './useSpot'

const mapsApp = MAPS_APPS[preferredMapsApp(navigator.userAgent)]

const FACES: Record<Emotion, string> = { Happy: happyFace, Angry: angryFace, Bored: boredFace, Hungry: hungryFace, Sad: sadFace }

type SuggestionOf<S extends Suggestion['status']> = Extract<Suggestion, { status: S }>

const SUGGESTION_TEXT: { [S in Suggestion['status']]: (suggestion: SuggestionOf<S>) => readonly string[] } = {
  idle: () => [],
  waiting: () => ['Finding a spot…'],
  searching: () => ['Finding a spot…'],
  found: ({ place, reason }) => [
    `Try ${place.name}, ${withArticle(PLACE_KINDS[place.kind].label)}.`,
    ...(reason === null ? [] : [reason]),
    'Press Enter again for another.',
  ],
  none: () => ['No matching places nearby. Tap the map to choose a spot instead.'],
  failed: () => ["Couldn't reach the places service. Press Enter to try again."],
  noLocation: () => ['Allow location access to get a suggestion.'],
}

function suggestionText<S extends Suggestion['status']>(suggestion: SuggestionOf<S>): readonly string[] {
  return SUGGESTION_TEXT[suggestion.status](suggestion)
}

function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`
}

// The question with a small number after the first mention of each option, like "Day¹ or night²?".
function numberedQuestion({ text, options }: Question): ReactNode[] {
  const parts: ReactNode[] = []
  let rest = text
  options.forEach((option, index) => {
    const at = rest.toLowerCase().indexOf(option.toLowerCase())
    if (at === -1) return
    parts.push(rest.slice(0, at + option.length), <sup key={index}>{index + 1}</sup>)
    rest = rest.slice(at + option.length)
  })
  return [...parts, rest]
}

export default function App() {
  const [emotion, setEmotion] = useState<Emotion | null>(null)
  const [answers, setAnswers] = useState<readonly (Answer | null)[]>(() => QUESTIONS.map(() => null))
  const [cleared, setCleared] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const filterRef = useRef<HTMLDialogElement>(null)
  const suggestionRef = useRef<HTMLDialogElement>(null)
  const [suggestionOpen, setSuggestionOpen] = useState(false)
  const confettiRef = useRef<HTMLDivElement>(null)
  const enterRef = useRef<HTMLButtonElement>(null)
  const { location, locate } = useCurrentPosition()
  const [travelMode, setTravelMode] = useState<TravelMode>('foot')
  const { spot, suggestion, suggest, tapSpot, reset: resetSpot } = useSpot(location, travelMode)
  const route = useRoute(location, spot, travelMode)
  const suggestionLines = suggestionText(suggestion)
  // Enter waits for an emotion and an answer to every question.
  const complete = emotion !== null && !answers.includes(null)
  const unanswered = answers.every((answer) => answer === null)
  const foundId = suggestion.status === 'found' ? suggestion.place.id : null

  // Gold confetti greets each place the pop-up shows: when it opens on one, or when one is found while it's open.
  useEffect(() => {
    if (suggestionOpen && foundId !== null && confettiRef.current !== null) burstConfetti(confettiRef.current)
  }, [suggestionOpen, foundId])

  // The Enter key does what the Enter button does, unless the focused control has its own use for it, the button is
  // disabled, or the map or a pop-up covers the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.repeat || event.isComposing || event.defaultPrevented) return
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.target instanceof Element && event.target.closest('button, a[href], summary, textarea, select')) return
      const enter = enterRef.current
      if (enter === null || enter.disabled || enter.closest('[inert]') !== null || document.querySelector('dialog[open]') !== null) return
      // Also stops a focused answer dot from submitting the form a second time.
      event.preventDefault()
      enter.click()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="page">
      <aside className="panel side" aria-hidden="true" />
      <main className="center">
        <fieldset className="panel emotion" inert={mapOpen} aria-labelledby="emotion-heading">
          <div className="emotion-body">
            <p id="emotion-heading" className="emotion-heading">
              How are you feeling?
            </p>
            <div className="faces">
              {EMOTIONS.map((option) => (
                <label key={option} className="face" title={option}>
                  <input
                    className="visually-hidden"
                    type="radio"
                    name="emotion"
                    checked={emotion === option}
                    onChange={() => setEmotion(option)}
                  />
                  <img src={FACES[option]} alt={option} />
                </label>
              ))}
            </div>
          </div>
        </fieldset>
        <form
          className="panel summary"
          inert={mapOpen}
          aria-labelledby="summary-heading"
          onSubmit={(event) => {
            event.preventDefault()
            // Enter looks for a place for the emotion and answers. The suggestion pops up and keeps up with the search.
            if (!complete) return
            suggest(emotion, answers)
            suggestionRef.current?.showModal()
            setSuggestionOpen(true)
          }}
        >
          <p id="summary-heading" className="summary-heading">
            In your own words
          </p>
          {/* The questions wait for an emotion: until one is picked they are greyed out and can't be answered. */}
          <ol className={emotion === null ? 'questions is-locked' : 'questions'}>
            {QUESTIONS.map((question, index) => (
              <li key={index} className="question" tabIndex={emotion === null ? undefined : -1}>
                <div className="question-body" role="radiogroup" aria-labelledby={`question-${index}`}>
                  <span id={`question-${index}`}>{numberedQuestion(question)}</span>
                  <span className="dots">
                    {ANSWERS.map((answer) => (
                      <label key={answer} className="dot-option">
                        <span className="dot-number" aria-hidden="true">
                          {answer}
                        </span>
                        <input
                          className="dot"
                          type="radio"
                          disabled={emotion === null}
                          name={`question-${index}`}
                          aria-label={`${answer}: ${question.options[answer - 1]}`}
                          checked={answers[index] === answer}
                          onChange={() => setAnswers((current) => current.with(index, answer))}
                        />
                      </label>
                    ))}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <div className="summary-submit">
            <button className="button filter-button" type="button" onClick={() => filterRef.current?.showModal()}>
              Filter
            </button>
            {/* Clear also takes the spot off the map. Once used, it stays highlighted until an answer is picked again. */}
            <button
              className={cleared && unanswered ? 'button is-cleared' : 'button'}
              type="button"
              disabled={unanswered}
              onClick={() => {
                setAnswers(QUESTIONS.map(() => null))
                setCleared(true)
                resetSpot()
              }}
            >
              Clear
            </button>
            <button ref={enterRef} className="button primary" type="submit" disabled={!complete}>
              Enter
            </button>
          </div>
        </form>
        <dialog ref={filterRef} className="panel popup" aria-labelledby="filter-title">
          <h2 id="filter-title">Filter</h2>
          <p>Places you don't want to be sent to will go here.</p>
          <form method="dialog">
            <button className="button">Close</button>
          </form>
        </dialog>
        <dialog ref={suggestionRef} className="panel popup" aria-labelledby="suggestion-text" onClose={() => setSuggestionOpen(false)}>
          <p id="suggestion-text" role="status">
            {suggestionLines.join(' ')}
          </p>
          <form method="dialog">
            <button className="button">Close</button>
          </form>
          <div ref={confettiRef} className="confetti" aria-hidden="true" />
        </dialog>
        <GpsMap
          location={location}
          locate={locate}
          spot={spot}
          onTap={tapSpot}
          route={route}
          travelMode={travelMode}
          onTravelModeChange={setTravelMode}
          open={mapOpen}
          onOpenChange={setMapOpen}
        />
        <div className="actions" inert={mapOpen}>
          {spot ? (
            <a className="button primary large" href={mapsApp.directionsUrl(spot.position, travelMode)} target="_blank" rel="noopener noreferrer">
              Get directions
            </a>
          ) : (
            <button className="button primary large" type="button" disabled>
              {emotion === null ? 'Pick an emotion or tap the map' : 'Get directions'}
            </button>
          )}
        </div>
      </main>
      <aside className="panel side" aria-hidden="true" />
    </div>
  )
}
