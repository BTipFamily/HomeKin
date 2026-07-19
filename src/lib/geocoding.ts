// Server-only: reads MAPBOX_SECRET_TOKEN. Never import this from a
// 'use client' file.

export type GeocodeResult = { lat: number; lng: number } | null

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const trimmed = address.trim()
  if (!trimmed) return null

  const token = process.env.MAPBOX_SECRET_TOKEN
  if (!token) {
    console.warn('MAPBOX_SECRET_TOKEN not set — skipping geocoding')
    return null
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    trimmed
  )}.json?access_token=${token}&limit=1`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.error('Geocoding request failed:', res.status, await res.text())
      return null
    }
    const json = await res.json()
    const feature = json.features?.[0]
    if (!feature?.center) return null
    const [lng, lat] = feature.center as [number, number]
    return { lat, lng }
  } catch (err) {
    console.error('Geocoding failed:', err)
    return null
  }
}
