import { randomUUID } from "crypto";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import axios from "axios";
import { prisma } from "../lib/prisma";
import { attachCoordinates, createLocation, Coordinates } from "../lib/location";
import { forbidden, HttpError, notFound } from "../lib/errors";
import {
  createPropertySchema,
  idParam,
  propertyFiltersSchema,
} from "../lib/schemas";
import { currentUser } from "../middleware/authMiddleware";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

/* ---------- helpers ---------- */

async function uploadPhoto(file: Express.Multer.File): Promise<string> {
  const safeName = file.originalname.replace(/[^\w.-]/g, "_");
  const result = await new Upload({
    client: s3Client,
    params: {
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: `properties/${randomUUID()}-${safeName}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    },
  }).done();

  if (!result.Location) throw new HttpError(502, "Photo upload failed");
  return result.Location;
}

async function geocodeAddress(address: {
  address: string;
  city: string;
  country: string;
  postalCode: string;
}): Promise<Coordinates> {
  const params = new URLSearchParams({
    street: address.address,
    city: address.city,
    country: address.country,
    postalcode: address.postalCode,
    format: "json",
    limit: "1",
  });

  const { data } = await axios.get<{ lon: string; lat: string }[]>(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      // Nominatim's usage policy requires an identifying User-Agent.
      headers: {
        "User-Agent":
          process.env.GEOCODER_USER_AGENT ?? "Rentiful/1.0 (rentiful-app)",
      },
      timeout: 8000,
    }
  );

  const hit = data[0];
  if (!hit?.lon || !hit?.lat) {
    throw new HttpError(422, "Could not geocode the provided address");
  }

  return { longitude: parseFloat(hit.lon), latitude: parseFloat(hit.lat) };
}

/* ---------- handlers ---------- */

/**
 * Public search. Filters are composed as parameterised SQL fragments and
 * joined with AND; the location and its coordinates are built with
 * json_build_object so the whole result is one round trip.
 */
export const getProperties = async (req: Request, res: Response) => {
  const f = propertyFiltersSchema.parse(req.query);
  const where: Prisma.Sql[] = [];

  if (f.favoriteIds?.length) {
    where.push(Prisma.sql`p.id IN (${Prisma.join(f.favoriteIds)})`);
  }
  if (f.priceMin !== undefined) {
    where.push(Prisma.sql`p."pricePerMonth" >= ${f.priceMin}`);
  }
  if (f.priceMax !== undefined) {
    where.push(Prisma.sql`p."pricePerMonth" <= ${f.priceMax}`);
  }
  if (f.beds !== undefined) {
    where.push(Prisma.sql`p.beds >= ${f.beds}`);
  }
  if (f.baths !== undefined) {
    where.push(Prisma.sql`p.baths >= ${f.baths}`);
  }
  if (f.squareFeetMin !== undefined) {
    where.push(Prisma.sql`p."squareFeet" >= ${f.squareFeetMin}`);
  }
  if (f.squareFeetMax !== undefined) {
    where.push(Prisma.sql`p."squareFeet" <= ${f.squareFeetMax}`);
  }
  if (f.propertyType) {
    where.push(Prisma.sql`p."propertyType" = ${f.propertyType}::"PropertyType"`);
  }
  if (f.amenities.length > 0) {
    where.push(
      Prisma.sql`p.amenities @> ${f.amenities}::text[]::"Amenity"[]`
    );
  }
  if (f.availableFrom) {
    // Available on a date when no lease covers that date.
    where.push(Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "Lease" l2
      WHERE l2."propertyId" = p.id
        AND l2."startDate" <= ${f.availableFrom}
        AND l2."endDate" >= ${f.availableFrom}
    )`);
  }
  if (f.latitude !== undefined && f.longitude !== undefined) {
    // `coordinates` is a geography column, so ST_DWithin measures true
    // metres on the spheroid. The old version cast to geometry and compared
    // degrees, which is wrong by up to ~40% depending on latitude.
    const radiusMeters = f.radiusKm * 1000;
    where.push(Prisma.sql`ST_DWithin(
      l.coordinates,
      ST_SetSRID(ST_MakePoint(${f.longitude}, ${f.latitude}), 4326)::geography,
      ${radiusMeters}
    )`);
  }

  const properties = await prisma.$queryRaw(Prisma.sql`
    SELECT
      p.*,
      json_build_object(
        'id', l.id,
        'address', l.address,
        'city', l.city,
        'state', l.state,
        'country', l.country,
        'postalCode', l."postalCode",
        'coordinates', json_build_object(
          'longitude', ST_X(l.coordinates::geometry),
          'latitude', ST_Y(l.coordinates::geometry)
        )
      ) AS location
    FROM "Property" p
    JOIN "Location" l ON p."locationId" = l.id
    ${where.length > 0 ? Prisma.sql`WHERE ${Prisma.join(where, " AND ")}` : Prisma.empty}
    ORDER BY p."postedDate" DESC
  `);

  res.json(properties);
};

export const getProperty = async (req: Request, res: Response) => {
  const { id } = idParam.parse(req.params);

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      location: true,
      manager: { select: { id: true, name: true, email: true, phoneNumber: true } },
    },
  });
  if (!property) throw notFound("Property");

  const [withCoordinates] = await attachCoordinates([property]);
  res.json(withCoordinates);
};

/**
 * Manager-only. Photos are streamed to S3, the address is geocoded, then the
 * Location (raw SQL, PostGIS point) and Property rows are written in one
 * transaction so a failure leaves no orphaned location.
 */
export const createProperty = async (req: Request, res: Response) => {
  const user = currentUser(req);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    throw new HttpError(400, "At least one photo is required");
  }

  const { address, city, state, country, postalCode, ...propertyData } =
    createPropertySchema.parse(req.body);

  const [photoUrls, coordinates] = await Promise.all([
    Promise.all(files.map(uploadPhoto)),
    geocodeAddress({ address, city, country, postalCode }),
  ]);

  const property = await prisma.$transaction(async (tx) => {
    const location = await createLocation(
      { address, city, state, country, postalCode, ...coordinates },
      tx
    );

    const created = await tx.property.create({
      data: {
        ...propertyData,
        photoUrls,
        locationId: location.id,
        managerCognitoId: user.id,
      },
      include: { manager: true },
    });

    return { ...created, location };
  });

  res.status(201).json(property);
};

/** Manager-only, and only for properties the manager owns. */
export const getPropertyLeases = async (req: Request, res: Response) => {
  const user = currentUser(req);
  const { id } = idParam.parse(req.params);

  const property = await prisma.property.findUnique({
    where: { id },
    select: { managerCognitoId: true },
  });
  if (!property) throw notFound("Property");
  if (property.managerCognitoId !== user.id) throw forbidden();

  const leases = await prisma.lease.findMany({
    where: { propertyId: id },
    include: {
      tenant: true,
      payments: { orderBy: { dueDate: "asc" } },
    },
    orderBy: { startDate: "desc" },
  });

  res.json(leases);
};
