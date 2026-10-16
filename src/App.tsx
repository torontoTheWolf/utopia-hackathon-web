import { useEffect, useRef, useState, type ReactNode } from 'react'
import angryFace from './assets/ANGRY.png'
import angryFaceDark from './assets/ANGRY_DARK.png'
import boredFace from './assets/BORDEM.png'
import boredFaceDark from './assets/BORED_DARK.png'
import happyFace from './assets/HAPPY.png'
import happyFaceDark from './assets/HAPPY_DARK.png'
import hungryFace from './assets/HUNGER.png'
import hungryFaceDark from './assets/HUNGRY_DARK.png'
import sadFace from './assets/SAD.png'
import sadFaceDark from './assets/SAD_DARK.png'
import { burstConfetti } from './confetti'
import { EMOTIONS, type Emotion } from './emotions'
import { useCurrentPosition } from './geo'
import GpsMap from './GpsMap'
import { FILTERABLE_KINDS, loadAvoided, saveAvoided, withKind } from './filter'
import { MAPS_APPS, preferredMapsApp } from './maps'
import { PLACE_KINDS, type PlaceKindId } from './places'
import { ANSWERS, QUESTIONS, type Answer, type Question } from './questions'
import type { TravelMode } from './route'
import { useRoute } from './useRoute'
import { applyTheme, savedDark } from './theme'
import { useSpot, type Suggestion } from './useSpot'

const mapsApp = MAPS_APPS[preferredMapsApp(navigator.userAgent)]

const FACES: Record<Emotion, string> = { Happy: happyFace, Angry: angryFace, Bored: boredFace, Hungry: hungryFace, Sad: sadFace }
const DARK_FACES: Record<Emotion, string> = {
  Happy: happyFaceDark,
  Angry: angryFaceDark,
  Bored: boredFaceDark,
  Hungry: hungryFaceDark,
  Sad: sadFaceDark,
}

type SuggestionOf<S extends Suggestion['status']> = Extract<Suggestion, { status: S }>

const SUGGESTION_TEXT: { [S in Suggestion['status']]: (suggestion: SuggestionOf<S>) => readonly string[] } = {
  idle: () => [],
  waiting: () => ['Finding a spot…'],
  searching: () => ['Finding a spot…'],
  found: ({ place, reason }) => [
    `Try ${place.name}, ${withArticle(PLACE_KINDS[place.kind].label)}.`,
    ...(reason === null ? [] : [reason]),
  ],
  none: () => ['No matching places nearby. Tap the map to choose a spot instead.'],
  filtered: ({ emotion }) => [`The filter leaves out every kind of place for ${emotion}. Change it to get a suggestion.`],
  failed: () => ["Couldn't reach the places service."],
  noLocation: () => ['Allow location access to get a suggestion.'],
}

function suggestionText<S extends Suggestion['status']>(suggestion: SuggestionOf<S>): readonly string[] {
  return SUGGESTION_TEXT[suggestion.status](suggestion)
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
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
  const [avoided, setAvoided] = useState<ReadonlySet<PlaceKindId>>(loadAvoided)
  const [dark, setDark] = useState(savedDark)
  const { spot, suggestion, suggest, tapSpot, reset: resetSpot } = useSpot(location, travelMode, avoided)
  const route = useRoute(location, spot, travelMode)
  useEffect(() => saveAvoided(avoided), [avoided])
  useEffect(() => applyTheme(dark), [dark])

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
      <aside className="panel side help" aria-labelledby="help-heading">
        <p id="help-heading" className="help-heading">
          How to use
        </p>
        <ol className="help-steps">
          <li>Pick the face that matches how you feel.</li>
          <li>Answer each question with 1 or 2.</li>
          <li>Press Enter to find a place.</li>
          <li>Choose Walk or Drive.</li>
          <li>Tap Get directions to go.</li>
        </ol>
        <p className="help-tip">Tap Try again for another place, or Clear to start over.</p>
      </aside>
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
                  <img src={(dark ? DARK_FACES : FACES)[option]} alt={option} />
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
          <p>Tick the kinds of place you never want to be sent to.</p>
          <ul className="filter-kinds">
            {FILTERABLE_KINDS.map((kind) => (
              <li key={kind}>
                <label>
                  <input
                    type="checkbox"
                    checked={avoided.has(kind)}
                    onChange={(event) => setAvoided((current) => withKind(current, kind, event.target.checked))}
                  />
                  {capitalised(PLACE_KINDS[kind].label)}
                </label>
              </li>
            ))}
          </ul>
          <form method="dialog">
            <button className="button">Close</button>
          </form>
        </dialog>
        <dialog ref={suggestionRef} className="panel popup" aria-labelledby="suggestion-text" onClose={() => setSuggestionOpen(false)}>
          <p id="suggestion-text" role="status">
            {suggestionLines.join(' ')}
          </p>
          <form method="dialog">
            {/* Looks for another place without closing, like pressing Enter again. */}
            <button
              className="button primary try-again"
              type="button"
              onClick={() => {
                if (complete) suggest(emotion, answers)
              }}
            >
              <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Try again
            </button>
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
            <a className="button primary large" href={mapsApp.directionsUrl({ position: spot.position, name: spot.origin === 'suggested' ? spot.name : undefined }, travelMode)} target="_blank" rel="noopener noreferrer">
              Get directions
            </a>
          ) : (
            <button className="button primary large" type="button" disabled>
              Get directions
            </button>
          )}
          <button
            className="button large theme-toggle"
            type="button"
            aria-label="Dark mode"
            aria-pressed={dark}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setDark((current) => !current)}
          >
            {dark ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4.5" fill="currentColor" />
                <path
                  d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
      </main>
      <aside className="panel side" aria-hidden="true" />
    </div>
  )
}
