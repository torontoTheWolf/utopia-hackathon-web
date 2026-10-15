import { useRef, useState } from 'react'
import { EMOTIONS, type Emotion } from './emotions'
import { useCurrentPosition, type LatLng } from './geo'
import GpsMap from './GpsMap'
import { MAPS_APPS, preferredMapsApp } from './maps'

const mapsApp = MAPS_APPS[preferredMapsApp(navigator.userAgent)]

export default function App() {
  const [emotion, setEmotion] = useState<Emotion | null>(null)
  const [summary, setSummary] = useState('')
  const [entered, setEntered] = useState<{ emotion: Emotion | null; summary: string } | null>(null)
  const [spot, setSpot] = useState<LatLng | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const filterRef = useRef<HTMLDialogElement>(null)
  const { location, locate } = useCurrentPosition()
  const gotIt = entered !== null && entered.emotion === emotion && entered.summary === summary

  return (
    <div className="page">
      <aside className="panel side" aria-hidden="true" />
      <main className="center">
        <fieldset className="panel emotion" inert={mapOpen}>
          <legend>How are you feeling?</legend>
          {EMOTIONS.map((option) => (
            <label key={option} className="pill">
              <input
                className="visually-hidden"
                type="radio"
                name="emotion"
                checked={emotion === option}
                onChange={() => setEmotion(option)}
              />
              {option}
            </label>
          ))}
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
          onSpotChange={setSpot}
          open={mapOpen}
          onOpenChange={setMapOpen}
        />
        <div className="actions" inert={mapOpen}>
          {spot ? (
            <a className="button primary large" href={mapsApp.directionsUrl(spot)} target="_blank" rel="noopener noreferrer">
              {`Open in ${mapsApp.label}`}
            </a>
          ) : (
            <>
              <button className="button primary large" type="button" disabled>
                Open in Maps
              </button>
              <p className="maps-note">Choose a spot on the map first</p>
            </>
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
