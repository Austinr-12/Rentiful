/** Longitude first, matching Mapbox GL and GeoJSON. */
export type LngLat = [number, number];

/**
 * Forward-geocodes a free-text place name with the Mapbox Geocoding API.
 * Returns `[longitude, latitude]` or null when nothing matched.
 *
 * Single source of truth for the three search inputs (hero, filter bar,
 * full filters) so coordinate order can never drift between them again.
 */
export async function geocodeLocation(query: string): Promise<LngLat | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json` +
    `?access_token=${token}&fuzzyMatch=true&limit=1`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const data: { features?: { center?: number[] }[] } = await response.json();
  const center = data.features?.[0]?.center;
  if (!center || center.length < 2) return null;

  const [lng, lat] = center;
  return [lng, lat];
}
