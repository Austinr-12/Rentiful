import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { attachCoordinates } from "../lib/location";
import { notFound } from "../lib/errors";
import {
  cognitoIdParam,
  profileSchema,
  updateProfileSchema,
} from "../lib/schemas";
import { currentUser } from "../middleware/authMiddleware";

export const getManager = async (req: Request, res: Response) => {
  const { cognitoId } = cognitoIdParam.parse(req.params);

  const manager = await prisma.manager.findUnique({ where: { cognitoId } });
  if (!manager) throw notFound("Manager");

  res.json(manager);
};

/** Id comes from the verified token; upsert makes a retry harmless. */
export const createManager = async (req: Request, res: Response) => {
  const user = currentUser(req);
  const data = profileSchema.parse(req.body);

  const manager = await prisma.manager.upsert({
    where: { cognitoId: user.id },
    create: { cognitoId: user.id, ...data },
    update: {},
  });

  res.status(201).json(manager);
};

export const updateManager = async (req: Request, res: Response) => {
  const { cognitoId } = cognitoIdParam.parse(req.params);
  const data = updateProfileSchema.parse(req.body);

  const manager = await prisma.manager.update({ where: { cognitoId }, data });

  res.json(manager);
};

export const getManagerProperties = async (req: Request, res: Response) => {
  const { cognitoId } = cognitoIdParam.parse(req.params);

  const properties = await prisma.property.findMany({
    where: { managerCognitoId: cognitoId },
    include: { location: true },
    orderBy: { postedDate: "desc" },
  });

  res.json(await attachCoordinates(properties));
};
