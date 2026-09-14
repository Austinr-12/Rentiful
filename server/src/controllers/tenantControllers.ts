import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { attachCoordinates } from "../lib/location";
import { notFound } from "../lib/errors";
import {
  cognitoIdParam,
  favoriteParams,
  profileSchema,
  updateProfileSchema,
} from "../lib/schemas";
import { currentUser } from "../middleware/authMiddleware";

/**
 * The client only ever needs favorite ids (to mark cards and to request the
 * full listings through /properties?favoriteIds=). Selecting ids keeps the
 * profile payload small instead of embedding every favorited property.
 */
const favoriteIds = { favorites: { select: { id: true } } } as const;

export const getTenant = async (req: Request, res: Response) => {
  const { cognitoId } = cognitoIdParam.parse(req.params);

  const tenant = await prisma.tenant.findUnique({
    where: { cognitoId },
    include: favoriteIds,
  });
  if (!tenant) throw notFound("Tenant");

  res.json(tenant);
};

/**
 * Creates the tenant profile for the authenticated user. The id always comes
 * from the verified token, never from the body, and the operation is an
 * upsert so a double submit from the client is harmless.
 */
export const createTenant = async (req: Request, res: Response) => {
  const user = currentUser(req);
  const data = profileSchema.parse(req.body);

  const tenant = await prisma.tenant.upsert({
    where: { cognitoId: user.id },
    create: { cognitoId: user.id, ...data },
    update: {},
    include: favoriteIds,
  });

  res.status(201).json(tenant);
};

export const updateTenant = async (req: Request, res: Response) => {
  const { cognitoId } = cognitoIdParam.parse(req.params);
  const data = updateProfileSchema.parse(req.body);

  const tenant = await prisma.tenant.update({
    where: { cognitoId },
    data,
    include: favoriteIds,
  });

  res.json(tenant);
};

export const getCurrentResidences = async (req: Request, res: Response) => {
  const { cognitoId } = cognitoIdParam.parse(req.params);

  const properties = await prisma.property.findMany({
    where: { tenants: { some: { cognitoId } } },
    include: { location: true },
    orderBy: { postedDate: "desc" },
  });

  res.json(await attachCoordinates(properties));
};

/** Idempotent: connecting an already-favorited property is a no-op. */
export const addFavoriteProperty = async (req: Request, res: Response) => {
  const { cognitoId, propertyId } = favoriteParams.parse(req.params);

  const tenant = await prisma.tenant.update({
    where: { cognitoId },
    data: { favorites: { connect: { id: propertyId } } },
    include: favoriteIds,
  });

  res.json(tenant);
};

export const removeFavoriteProperty = async (req: Request, res: Response) => {
  const { cognitoId, propertyId } = favoriteParams.parse(req.params);

  const tenant = await prisma.tenant.update({
    where: { cognitoId },
    data: { favorites: { disconnect: { id: propertyId } } },
    include: favoriteIds,
  });

  res.json(tenant);
};
