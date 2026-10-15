import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useEffectEvent, useRef } from 'react'
import type { LatLng, LocationState } from './geo'
import type { Spot } from './useSpot'

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const NEW_TAB = 'target="_blank" rel="noopener noreferrer"'
const ATTRIBUTION = `&copy; <a href="https://www.openstreetmap.org/copyright" ${NEW_TAB}>OpenStreetMap</a> contributors`
const LEAFLET_PREFIX = `<a href="https://leafletjs.com" ${NEW_TAB}>Leaflet</a>`
const BLUE = '#1a73e8'
const GREEN = '#166534'
const SPOT_ZOOM = 15
const MAX_FIT_ZOOM = 17
const MARKER_ROOM = 32

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
  spot: Spot | null
  onTap: (position: LatLng) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function GpsMap({ location, locate, spot, onTap, open, onOpenChange }: Props) {
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
    const resizeObserver = new ResizeObserver(() => map.invalidateSize())
    resizeObserver.observe(container)
    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const onClick = ({ latlng }: L.LeafletMouseEvent) => onTap({ lat: latlng.lat, lng: latlng.lng })
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [onTap])

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
        L.polyline([position, spot.position], {
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
      const marker = L.circleMarker(spot.position, {
        radius: 9,
        color: '#000',
        weight: 3,
        fillColor: GREEN,
        fillOpacity: 1,
        interactive: false,
        className: 'gps-spot',
      }).addTo(overlay)
      if (spot.origin === 'suggested') {
        marker.bindTooltip(spot.name, { permanent: true, direction: 'auto', offset: [12, 0], className: 'gps-spot-name' })
      }
    }
  }, [location, spot])

  const fitSuggestedSpot = useEffectEvent(() => {
    const map = mapRef.current
    if (!map || spot?.origin !== 'suggested') return
    map.invalidateSize()
    if (location.status !== 'located') {
      map.setView(spot.position, SPOT_ZOOM)
      return
    }
    const { x, y } = map.getSize()
    // The collapsed map is a circle, so both points must sit inside its inscribed square.
    const inset = Math.round((Math.min(x, y) * (1 - Math.SQRT1_2)) / 2) + MARKER_ROOM
    map.fitBounds(L.latLngBounds(location.position, spot.position), { padding: [inset, inset], maxZoom: MAX_FIT_ZOOM })
  })

  useEffect(() => {
    fitSuggestedSpot()
  }, [spot])

  useEffect(() => {
    fitSuggestedSpot()
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
