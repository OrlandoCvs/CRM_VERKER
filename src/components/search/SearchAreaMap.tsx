'use client'

import 'leaflet/dist/leaflet.css'
import {
  MapContainer,
  TileLayer,
  Circle,
  Polygon,
  Polyline,
  CircleMarker,
  useMapEvents,
} from 'react-leaflet'

interface Props {
  mode: 'circle' | 'polygon'
  /** Centre of the circle ([lat, lng]). Null until the user clicks the map. */
  center: [number, number] | null
  radiusKm: number
  /** Polygon vertices in click order ([lat, lng]). */
  vertices: [number, number][]
  onSetCenter: (latlng: [number, number]) => void
  onAddVertex: (latlng: [number, number]) => void
}

const DEFAULT_CENTER: [number, number] = [40.4168, -3.7038] // Madrid
const DEFAULT_ZOOM = 5

function ClickHandler({
  mode,
  onCircleClick,
  onPolygonClick,
}: {
  mode: 'circle' | 'polygon'
  onCircleClick: (ll: [number, number]) => void
  onPolygonClick: (ll: [number, number]) => void
}) {
  useMapEvents({
    click(e) {
      const ll: [number, number] = [e.latlng.lat, e.latlng.lng]
      if (mode === 'circle') onCircleClick(ll)
      else onPolygonClick(ll)
    },
  })
  return null
}

export function SearchAreaMap({
  mode,
  center,
  radiusKm,
  vertices,
  onSetCenter,
  onAddVertex,
}: Props) {
  return (
    <MapContainer
      center={center ?? DEFAULT_CENTER}
      zoom={center ? 12 : DEFAULT_ZOOM}
      style={{ height: '100%', width: '100%' }}
      className="z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler
        mode={mode}
        onCircleClick={onSetCenter}
        onPolygonClick={onAddVertex}
      />

      {mode === 'circle' && center && (
        <>
          <Circle
            center={center}
            radius={radiusKm * 1000}
            pathOptions={{
              color: '#2563eb',
              fillColor: '#3b82f6',
              fillOpacity: 0.15,
              weight: 2,
            }}
          />
          <CircleMarker
            center={center}
            radius={6}
            pathOptions={{
              color: '#1d4ed8',
              fillColor: '#3b82f6',
              fillOpacity: 1,
              weight: 2,
            }}
          />
        </>
      )}

      {mode === 'polygon' && (
        <>
          {vertices.length >= 3 && (
            <Polygon
              positions={vertices}
              pathOptions={{
                color: '#2563eb',
                fillColor: '#3b82f6',
                fillOpacity: 0.15,
                weight: 2,
              }}
            />
          )}
          {vertices.length === 2 && (
            <Polyline positions={vertices} pathOptions={{ color: '#2563eb', weight: 2 }} />
          )}
          {vertices.map((v, i) => (
            <CircleMarker
              key={i}
              center={v}
              radius={5}
              pathOptions={{
                color: '#1d4ed8',
                fillColor: '#3b82f6',
                fillOpacity: 1,
                weight: 2,
              }}
            />
          ))}
        </>
      )}
    </MapContainer>
  )
}
