import { useRef, useState } from 'react'
import angryFace from './assets/ANGRY.png'
import tiredFace from './assets/BORDEM.png'
import happyFace from './assets/HAPPY.png'
import hungryFace from './assets/HUNGER.png'
import sadFace from './assets/SAD.png'
import { EMOTIONS, type Emotion } from './emotions'
import { useCurrentPosition } from './geo'
import GpsMap from './GpsMap'
import { MAPS_APPS, preferredMapsApp } from './maps'
import { PLACE_KINDS } from './places'
import { useSpot, type Suggestion } from './useSpot'

const mapsApp = MAPS_APPS[preferredMapsApp(navigator.userAgent)]

const FACES: Record<Emotion, string> = { Happy: happyFace, Angry: angryFace, Tired: tiredFace, Hungry: hungryFace, Sad: sadFace }

type SuggestionOf<S extends Suggestion['status']> = Extract<Suggestion, { status: S }>

const SUGGESTION_TEXT: { [S in Suggestion['status']]: (suggestion: SuggestionOf<S>) => readonly string[] } = {
  idle: () => [],
  waiting: () => ['Finding a spot…'],
  searching: () => ['Finding a spot…'],
  found: ({ emotion, place, distanceKm }) => [
    `Try ${place.name}, a ${PLACE_KINDS[place.kind].label} ${formatDistance(distanceKm)} away.`,
    `Tap ${emotion} again for another.`,
  ],
  none: () => ['No matching places nearby. Tap the map to choose a spot instead.'],
  failed: ({ emotion }) => [`Couldn't reach the places service. Tap ${emotion} to try again.`],
  noLocation: () => ['Allow location access to get a suggestion.'],
}

function suggestionText<S extends Suggestion['status']>(suggestion: SuggestionOf<S>): readonly string[] {
  return SUGGESTION_TEXT[suggestion.status](suggestion)
}

function formatDistance(km: number): string {
  const metres = Math.round(km * 100) * 10
  return metres < 1000 ? `${metres} m` : `${km.toFixed(1)} km`
}

export default function App() {
  const [emotion, setEmotion] = useState<Emotion | null>(null)
  const [summary, setSummary] = useState('')
  const [entered, setEntered] = useState<{ emotion: Emotion | null; summary: string } | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const filterRef = useRef<HTMLDialogElement>(null)
  const { location, locate } = useCurrentPosition()
  const { spot, suggestion, suggest, tapSpot } = useSpot(location)
  const gotIt = entered !== null && entered.emotion === emotion && entered.summary === summary

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
              <p>{suggestionText(suggestion).join(' ')}</p>
            </div>
          </div>
        </fieldset>
        <form
          className="panel summary"
          inert={mapOpen}
          onSubmit={(event) => {
            event.preventDefault()
            setEntered({ emotion, summary })
          }}
        >
          <label htmlFor="summary">In your own words</label>
          <textarea
            id="summary"
            placeholder="Enter your own summary of how you feel here"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
          <div className="summary-submit">
            <p role="status">{gotIt && 'Got it'}</p>
            <button className="button primary" type="submit" disabled={emotion === null && summary.trim() === ''}>
              Enter
            </button>
          </div>
        </form>
        <GpsMap
          location={location}
          locate={locate}
          spot={spot}
          onTap={tapSpot}
          open={mapOpen}
          onOpenChange={setMapOpen}
        />
        <div className="actions" inert={mapOpen}>
          {spot ? (
            <a className="button primary large" href={mapsApp.directionsUrl(spot.position)} target="_blank" rel="noopener noreferrer">
              {`Open in ${mapsApp.label}`}
            </a>
          ) : (
            <button className="button primary large" type="button" disabled>
              Pick an emotion or tap the map
            </button>
          )}
          <button className="button large filter-button" type="button" onClick={() => filterRef.current?.showModal()}>
            Filter
          </button>
          <dialog ref={filterRef} className="panel filter-dialog" aria-labelledby="filter-title">
            <h2 id="filter-title">Filter</h2>
            <p>Places you don't want to be sent to will go here.</p>
            <form method="dialog">
              <button className="button">Close</button>
            </form>
          </dialog>
        </div>
      </main>
      <aside className="panel side" aria-hidden="true" />
    </div>
  )
}
