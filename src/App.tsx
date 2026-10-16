import { useRef, useState } from 'react'
import angryFace from './assets/ANGRY.png'
import boredFace from './assets/BORDEM.png'
import happyFace from './assets/HAPPY.png'
import hungryFace from './assets/HUNGER.png'
import sadFace from './assets/SAD.png'
import { EMOTIONS, type Emotion } from './emotions'
import { useCurrentPosition } from './geo'
import GpsMap from './GpsMap'
import { MAPS_APPS, preferredMapsApp } from './maps'
import { PLACE_KINDS } from './places'
import { formatDistance, TRAVEL_MODES, type TravelMode } from './route'
import { useRoute, type RouteState } from './useRoute'
import { useSpot, type Suggestion } from './useSpot'

const mapsApp = MAPS_APPS[preferredMapsApp(navigator.userAgent)]

const FACES: Record<Emotion, string> = { Happy: happyFace, Angry: angryFace, Bored: boredFace, Hungry: hungryFace, Sad: sadFace }

const QUESTIONS = ['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5']

const DOTS = 2

type SuggestionOf<S extends Suggestion['status']> = Extract<Suggestion, { status: S }>

const SUGGESTION_TEXT: { [S in Suggestion['status']]: (suggestion: SuggestionOf<S>, route: RouteState) => readonly string[] } = {
  idle: () => [],
  waiting: () => ['Finding a spot…'],
  searching: () => ['Finding a spot…'],
  found: ({ emotion, place, distanceKm }, route) => {
    if (route.status === 'loading') return ['Finding a spot…']
    // Without a route, the distance is in a straight line.
    const away =
      route.status === 'ready' && route.route !== null
        ? `${formatDistance(route.route.distanceKm)} away ${TRAVEL_MODES[route.mode].phrase}`
        : `${formatDistance(distanceKm)} away`
    return [`Try ${place.name}, ${withArticle(PLACE_KINDS[place.kind].label)} ${away}.`, `Tap ${emotion} again for another.`]
  },
  none: () => ['No matching places nearby. Tap the map to choose a spot instead.'],
  failed: ({ emotion }) => [`Couldn't reach the places service. Tap ${emotion} to try again.`],
  noLocation: () => ['Allow location access to get a suggestion.'],
}

function suggestionText<S extends Suggestion['status']>(suggestion: SuggestionOf<S>, route: RouteState): readonly string[] {
  return SUGGESTION_TEXT[suggestion.status](suggestion, route)
}

function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`
}

export default function App() {
  const [emotion, setEmotion] = useState<Emotion | null>(null)
  const [answers, setAnswers] = useState<readonly (number | null)[]>(() => QUESTIONS.map(() => null))
  const [entered, setEntered] = useState<{ emotion: Emotion | null; answers: readonly (number | null)[] } | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const filterRef = useRef<HTMLDialogElement>(null)
  const { location, locate } = useCurrentPosition()
  const [travelMode, setTravelMode] = useState<TravelMode>('foot')
  const { spot, suggestion, suggest, tapSpot } = useSpot(location, travelMode)
  const route = useRoute(location, spot, travelMode)
  const gotIt = entered !== null && entered.emotion === emotion && entered.answers.every((answer, index) => answer === answers[index])

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
                    onClick={() => suggest(option)}
                  />
                  <img src={FACES[option]} alt={option} />
                </label>
              ))}
            </div>
            <div className="suggestion" role="status">
              <p>{suggestionText(suggestion, route).join(' ')}</p>
            </div>
          </div>
        </fieldset>
        <form
          className="panel summary"
          inert={mapOpen}
          aria-labelledby="summary-heading"
          onSubmit={(event) => {
            event.preventDefault()
            setEntered({ emotion, answers })
          }}
        >
          <p id="summary-heading" className="summary-heading">
            In your own words
          </p>
          <ol className="questions">
            {QUESTIONS.map((question, index) => (
              <li key={index} className="question" tabIndex={-1}>
                <div className="question-body" role="radiogroup" aria-labelledby={`question-${index}`}>
                  <span id={`question-${index}`}>{question}</span>
                  <span className="dots">
                    {Array.from({ length: DOTS }, (_, dot) => (
                      <input
                        key={dot}
                        className="dot"
                        type="radio"
                        name={`question-${index}`}
                        aria-label={`${dot + 1} of ${DOTS}`}
                        checked={answers[index] === dot + 1}
                        onChange={() => setAnswers((current) => current.with(index, dot + 1))}
                      />
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
            <p role="status">{gotIt && 'Got it'}</p>
            <button className="button primary" type="submit" disabled={emotion === null && answers.every((answer) => answer === null)}>
              Enter
            </button>
          </div>
        </form>
        <dialog ref={filterRef} className="panel filter-dialog" aria-labelledby="filter-title">
          <h2 id="filter-title">Filter</h2>
          <p>Places you don't want to be sent to will go here.</p>
          <form method="dialog">
            <button className="button">Close</button>
          </form>
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
