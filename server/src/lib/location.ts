import { Location, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export interface Coordinates {
  longitude: number;
  latitude: number;
}

export type LocationWithCoordinates = Location & { coordinates: Coordinates };

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * Fetch coordinates for many locations in one round trip.
 *
 * The Prisma schema declares `Location.coordinates` as an Unsupported
 * PostGIS geography column, so the ORM cannot select it. Instead of
 * issuing one `ST_AsText` query per row (the previous N+1), select
 * `ST_X` / `ST_Y` for every requested id at once.
 */
export async function getCoordinatesByLocationId(
  locationIds: number[],
  db: Tx = prisma
): Promise<Map<number, Coordinates>> {
  const ids = [...new Set(locationIds)];
  if (ids.length === 0) return new Map();

  const rows = await db.$queryRaw<
    { id: number; longitude: number; latitude: number }[]
  >`
    SELECT
      id,
      ST_X(coordinates::geometry) AS longitude,
      ST_Y(coordinates::geometry) AS latitude
    FROM "Location"
    WHERE id IN (${Prisma.join(ids)})
  `;

  return new Map(rows.map((r) => [r.id, { longitude: r.longitude, latitude: r.latitude }]));
}

/**
 * Attach `{ longitude, latitude }` to every `property.location` using a
 * single coordinates query, regardless of how many properties there are.
 */
export async function attachCoordinates<T extends { location: Location }>(
  properties: T[],
  db: Tx = prisma
): Promise<(Omit<T, "location"> & { location: LocationWithCoordinates })[]> {
  const coords = await getCoordinatesByLocationId(
    properties.map((p) => p.location.id),
    db
  );

  return properties.map((property) => ({
    ...property,
    location: {
      ...property.location,
      coordinates: coords.get(property.location.id) ?? { longitude: 0, latitude: 0 },
    },
  }));
}

/**
 * Insert a Location row with a PostGIS point and return it with coordinates.
 * Raw SQL is required because Prisma cannot write Unsupported columns.
 */
export async function createLocation(
  data: {
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  } & Coordinates,
  db: Tx = prisma
): Promise<LocationWithCoordinates> {
  const [row] = await db.$queryRaw<
    (Location & { longitude: number; latitude: number })[]
  >`
    INSERT INTO "Location" (address, city, state, country, "postalCode", coordinates)
    VALUES (
      ${data.address}, ${data.city}, ${data.state}, ${data.country}, ${data.postalCode},
      ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326)
    )
    RETURNING
      id, address, city, state, country, "postalCode",
      ST_X(coordinates::geometry) AS longitude,
      ST_Y(coordinates::geometry) AS latitude
  `;

  const { longitude, latitude, ...location } = row;
  return { ...location, coordinates: { longitude, latitude } };
}
