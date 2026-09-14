import { z } from "zod";
import {
  Amenity,
  ApplicationStatus,
  Highlight,
  PropertyType,
} from "@prisma/client";

/* ---------- shared pieces ---------- */

const trimmed = (max: number) => z.string().trim().min(1).max(max);

/** Treats the client's "any" sentinel and empty strings as "not provided". */
const optionalFilter = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === "any" || value === "" ? undefined : value),
    schema.optional()
  );

/** "a,b,c" -> ["a", "b", "c"], validated against an enum. */
const csvEnum = <T extends Record<string, string>>(enumObject: T) =>
  z.preprocess((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string" || value === "" || value === "any") return [];
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }, z.array(z.nativeEnum(enumObject)));

/** Multipart form fields arrive as strings; accept "true"/"false" as booleans. */
const boolString = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

/* ---------- route params ---------- */

export const idParam = z.object({
  id: z.coerce.number().int().positive(),
});

export const cognitoIdParam = z.object({
  cognitoId: z.string().min(1),
});

export const favoriteParams = cognitoIdParam.extend({
  propertyId: z.coerce.number().int().positive(),
});

/* ---------- tenant / manager profiles ---------- */

export const profileSchema = z.object({
  name: trimmed(100),
  email: z.string().trim().email().max(254),
  // Empty is allowed because the client creates the record before the user
  // has filled in a phone number.
  phoneNumber: z.string().trim().max(30).default(""),
});

export const updateProfileSchema = profileSchema.partial();

/* ---------- properties ---------- */

export const propertyFiltersSchema = z.object({
  favoriteIds: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map(Number)
            .filter((n) => Number.isInteger(n) && n > 0)
        : undefined
    ),
  priceMin: optionalFilter(z.coerce.number().nonnegative()),
  priceMax: optionalFilter(z.coerce.number().nonnegative()),
  beds: optionalFilter(z.coerce.number().int().nonnegative()),
  baths: optionalFilter(z.coerce.number().nonnegative()),
  squareFeetMin: optionalFilter(z.coerce.number().int().nonnegative()),
  squareFeetMax: optionalFilter(z.coerce.number().int().nonnegative()),
  propertyType: optionalFilter(z.nativeEnum(PropertyType)),
  amenities: csvEnum(Amenity),
  availableFrom: optionalFilter(z.coerce.date()),
  latitude: optionalFilter(z.coerce.number().min(-90).max(90)),
  longitude: optionalFilter(z.coerce.number().min(-180).max(180)),
  /** Search radius around lat/lng in kilometres. */
  radiusKm: z.coerce.number().positive().max(500).default(50),
});

export type PropertyFilters = z.infer<typeof propertyFiltersSchema>;

export const createPropertySchema = z.object({
  name: trimmed(150),
  description: trimmed(5000),
  pricePerMonth: z.coerce.number().positive(),
  securityDeposit: z.coerce.number().nonnegative(),
  applicationFee: z.coerce.number().nonnegative(),
  isPetsAllowed: boolString.default(false),
  isParkingIncluded: boolString.default(false),
  amenities: csvEnum(Amenity),
  highlights: csvEnum(Highlight),
  beds: z.coerce.number().int().min(0).max(20),
  baths: z.coerce.number().min(0).max(20),
  squareFeet: z.coerce.number().int().positive(),
  propertyType: z.nativeEnum(PropertyType),
  address: trimmed(200),
  city: trimmed(100),
  state: trimmed(100),
  country: trimmed(100),
  postalCode: trimmed(20),
});

/* ---------- applications ---------- */

export const createApplicationSchema = z.object({
  propertyId: z.coerce.number().int().positive(),
  name: trimmed(100),
  email: z.string().trim().email().max(254),
  phoneNumber: z.string().trim().min(7).max(30),
  message: z.string().trim().max(2000).optional(),
});

export const updateApplicationStatusSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
});
