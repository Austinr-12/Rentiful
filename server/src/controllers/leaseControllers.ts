import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { forbidden, notFound } from "../lib/errors";
import { idParam } from "../lib/schemas";
import { AuthenticatedUser, currentUser } from "../middleware/authMiddleware";

/** Tenants see their own leases; managers see leases on their properties. */
const leaseScope = (user: AuthenticatedUser): Prisma.LeaseWhereInput =>
  user.role === "tenant"
    ? { tenantCognitoId: user.id }
    : { property: { managerCognitoId: user.id } };

export const getLeases = async (req: Request, res: Response) => {
  const user = currentUser(req);

  const leases = await prisma.lease.findMany({
    where: leaseScope(user),
    include: { tenant: true, property: true },
    orderBy: { startDate: "desc" },
  });

  res.json(leases);
};

export const getLeasePayments = async (req: Request, res: Response) => {
  const user = currentUser(req);
  const { id } = idParam.parse(req.params);

  const lease = await prisma.lease.findUnique({
    where: { id },
    select: {
      tenantCognitoId: true,
      property: { select: { managerCognitoId: true } },
    },
  });
  if (!lease) throw notFound("Lease");

  const allowed =
    user.role === "tenant"
      ? lease.tenantCognitoId === user.id
      : lease.property.managerCognitoId === user.id;
  if (!allowed) throw forbidden();

  const payments = await prisma.payment.findMany({
    where: { leaseId: id },
    orderBy: { dueDate: "asc" },
  });

  res.json(payments);
};
