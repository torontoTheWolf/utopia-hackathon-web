import { useState } from 'react'
import { EMOTIONS, parseEmotion, type Emotion } from './emotions'
import { useCurrentPosition, type LatLng } from './geo'
import GpsMap from './GpsMap'
import { MAPS_APPS, preferredMapsApp } from './maps'

const mapsApp = MAPS_APPS[preferredMapsApp(navigator.userAgent)]

export default function App() {
  const [emotion, setEmotion] = useState<Emotion | null>(null)
  const [summary, setSummary] = useState('')
  const [spot, setSpot] = useState<LatLng | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const { location, locate } = useCurrentPosition()

  return (
    <div className="page">
      <aside className="panel side" aria-hidden="true" />
      <main className="center">
        <div className="panel emotion" inert={mapOpen}>
          <label htmlFor="emotion">How are you feeling?</label>
          <select id="emotion" value={emotion ?? ''} onChange={(event) => setEmotion(parseEmotion(event.target.value))}>
            <option value="">Choose an emotion</option>
            {EMOTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="panel summary" inert={mapOpen}>
          <label htmlFor="summary">In your own words</label>
          <textarea
            id="summary"
            placeholder="Enter your own summary of how you feel here"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </div>
        <GpsMap
          location={location}
          locate={locate}
          spot={spot}
          onSpotChange={setSpot}
          open={mapOpen}
          onOpenChange={setMapOpen}
        />
        <div className="maps-action" inert={mapOpen}>
          {spot ? (
            <a className="maps-button" href={mapsApp.directionsUrl(spot)} target="_blank" rel="noopener noreferrer">
              {`Open in ${mapsApp.label}`}
            </a>
          ) : (
            <>
              <button className="maps-button" type="button" disabled>
                Open in Maps
              </button>
              <p className="maps-note">Choose a spot on the map first</p>
            </>
          )}
        </div>
      </main>
      <aside className="panel side" aria-hidden="true" />
    </div>
  )
}
