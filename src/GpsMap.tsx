import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { LatLng, LocationState } from './geo'

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const NEW_TAB = 'target="_blank" rel="noopener noreferrer"'
const ATTRIBUTION = `&copy; <a href="https://www.openstreetmap.org/copyright" ${NEW_TAB}>OpenStreetMap</a> contributors`
const LEAFLET_PREFIX = `<a href="https://leafletjs.com" ${NEW_TAB}>Leaflet</a>`
const BLUE = '#1a73e8'
const MAGENTA = '#ff00dc'

const LOCATION_TEXT: Record<LocationState['status'], { circle: string | null; notice: string | null }> = {
  locating: { circle: 'Finding you…', notice: null },
  located: { circle: null, notice: null },
  denied: {
    circle: 'Location is blocked',
    notice: 'Location is blocked. Allow it in your browser settings to see where you are.',
  },
  unavailable: { circle: "Location isn't available", notice: "Your location isn't available right now." },
}

type Props = {
  location: LocationState
  locate: () => void
  spot: LatLng | null
  onSpotChange: (spot: LatLng) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function GpsMap({ location, locate, spot, onSpotChange, open, onOpenChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
  const centeredRef = useRef(false)
  const wasOpenRef = useRef(open)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const map = L.map(container, { zoomControl: false }).setView([20, 0], 2)
    L.control.zoom({ position: 'bottomleft' }).addTo(map)
    map.attributionControl.setPrefix(LEAFLET_PREFIX)
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map)
    mapRef.current = map
    overlayRef.current = L.layerGroup().addTo(map)
    centeredRef.current = false
    return () => {
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const onClick = ({ latlng }: L.LeafletMouseEvent) => onSpotChange({ lat: latlng.lat, lng: latlng.lng })
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [onSpotChange])

  useEffect(() => {
    if (location.status !== 'located' || centeredRef.current) return
    centeredRef.current = true
    mapRef.current?.setView(location.position, 16)
  }, [location])

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.clearLayers()
    if (location.status === 'located') {
      const { position, accuracy } = location
      L.circle(position, { radius: accuracy, color: BLUE, weight: 1, fillOpacity: 0.15, interactive: false }).addTo(
        overlay,
      )
      if (spot) {
        L.polyline([position, spot], {
          color: '#000',
          weight: 3,
          dashArray: '6 8',
          interactive: false,
          className: 'gps-route',
        }).addTo(overlay)
      }
      L.circleMarker(position, {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: BLUE,
        fillOpacity: 1,
        interactive: false,
        className: 'gps-here',
      }).addTo(overlay)
    }
    if (spot) {
      L.circleMarker(spot, {
        radius: 9,
        color: '#000',
        weight: 3,
        fillColor: MAGENTA,
        fillOpacity: 1,
        interactive: false,
        className: 'gps-spot',
      }).addTo(overlay)
    }
  }, [location, spot])

  useEffect(() => {
    mapRef.current?.invalidateSize()
    if (open) closeButtonRef.current?.focus()
    else if (wasOpenRef.current) openButtonRef.current?.focus()
    wasOpenRef.current = open
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  const text = LOCATION_TEXT[location.status]

  return (
    <div className="gps-slot">
      <div
        className={open ? 'gps is-open' : 'gps'}
        role={open ? 'dialog' : undefined}
        aria-modal={open || undefined}
        aria-label={open ? 'Map' : undefined}
      >
        <div ref={containerRef} className="gps-map" inert={!open} />
        {open ? (
          <div className="gps-bar">
            <div className="gps-hint" role="status">
              {!spot && <p>Tap the map to choose a spot</p>}
              {text.notice && <p>{text.notice}</p>}
            </div>
            <button ref={closeButtonRef} className="button gps-close" type="button" onClick={() => onOpenChange(false)}>
              Close map
            </button>
          </div>
        ) : (
          <button
            ref={openButtonRef}
            className="gps-open"
            type="button"
            aria-label="Open map"
            onClick={() => {
              locate()
              onOpenChange(true)
            }}
          >
            {text.circle && <span>{text.circle}</span>}
          </button>
        )}
      </div>
      {!open && (
        <p className="gps-credit">
          &copy;{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>{' '}
          contributors
        </p>
      )}
    </div>
  )
}
