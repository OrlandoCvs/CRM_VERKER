/** A GeoJSON polygon with an outer ring of [longitude, latitude] pairs. */
export type GeoJsonPolygon = {
  type: 'Polygon'
  coordinates: [number, number][][]
}

/**
 * Approximates a circle on the Earth's surface by a closed polygon.
 * Uses the equirectangular approximation, which is accurate enough for
 * areas up to a few hundred kilometres (well within Google Places use).
 *
 * @param centerLat  latitude in degrees
 * @param centerLng  longitude in degrees
 * @param radiusKm   radius in kilometres
 * @param vertices   number of vertices used to approximate the circle
 */
export function circleToGeoJsonPolygon(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  vertices = 32,
): GeoJsonPolygon {
  const earthRadiusKm = 6371
  const latRad = (centerLat * Math.PI) / 180
  const ring: [number, number][] = []

  for (let i = 0; i < vertices; i++) {
    const angle = (2 * Math.PI * i) / vertices
    const dx = radiusKm * Math.cos(angle)
    const dy = radiusKm * Math.sin(angle)
    const dLat = (dy / earthRadiusKm) * (180 / Math.PI)
    const dLng = (dx / (earthRadiusKm * Math.cos(latRad))) * (180 / Math.PI)
    ring.push([centerLng + dLng, centerLat + dLat])
  }
  ring.push(ring[0]) // close the ring
  return { type: 'Polygon', coordinates: [ring] }
}

/**
 * Turns a list of `[lat, lng]` vertices (the form react-leaflet emits) into a
 * GeoJSON Polygon with the coordinate order Apify expects (`[lng, lat]`) and
 * a closed outer ring.
 */
export function verticesToGeoJsonPolygon(
  vertices: [number, number][],
): GeoJsonPolygon {
  const ring: [number, number][] = vertices.map(([lat, lng]) => [lng, lat])
  if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0])
  }
  return { type: 'Polygon', coordinates: [ring] }
}

/** A loose check for a usable polygon (≥ 3 distinct vertices + closing point). */
export function isValidPolygon(polygon: GeoJsonPolygon): boolean {
  const ring = polygon.coordinates[0]
  return Array.isArray(ring) && ring.length >= 4
}
