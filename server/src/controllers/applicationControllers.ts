import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { conflict, forbidden, notFound } from "../lib/errors";
import {
  createApplicationSchema,
  idParam,
  updateApplicationStatusSchema,
} from "../lib/schemas";
import { AuthenticatedUser, currentUser } from "../middleware/authMiddleware";

/* ---------- shared shape ---------- */

const applicationInclude = {
  property: { include: { location: true, manager: true } },
  tenant: true,
  lease: true,
} satisfies Prisma.ApplicationInclude;

type ApplicationRow = Prisma.ApplicationGetPayload<{
  include: typeof applicationInclude;
}>;

/**
 * First monthly payment date strictly after `today`, counted from `startDate`.
 * Date arithmetic is done in UTC so the result does not depend on the
 * server's timezone or on daylight-saving transitions.
 */
export function nextPaymentDate(startDate: Date, today = new Date()): Date {
  const next = new Date(startDate);
  while (next <= today) next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export function addOneYear(date: Date): Date {
  const end = new Date(date);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end;
}

/** Flattens the row into the shape the dashboard cards expect. */
const formatApplication = (app: ApplicationRow) => ({
  ...app,
  property: { ...app.property, address: app.property.location.address },
  manager: app.property.manager,
  lease: app.lease
    ? { ...app.lease, nextPaymentDate: nextPaymentDate(app.lease.startDate) }
    : null,
});

/** Tenants see their own applications; managers see those on their properties. */
const applicationScope = (user: AuthenticatedUser): Prisma.ApplicationWhereInput =>
  user.role === "tenant"
    ? { tenantCognitoId: user.id }
    : { property: { managerCognitoId: user.id } };

/* ---------- handlers ---------- */

/**
 * One query with the lease included, replacing the previous per-application
 * lease lookup (N+1). Scope comes from the verified token, not from query
 * params the caller could set to someone else's id.
 */
export const listApplications = async (req: Request, res: Response) => {
  const user = currentUser(req);

  const applications = await prisma.application.findMany({
    where: applicationScope(user),
    include: applicationInclude,
    orderBy: { applicationDate: "desc" },
  });

  res.json(applications.map(formatApplication));
};

/**
 * Tenant-only. Status, date and tenant id are set by the server. No lease is
 * created here: a lease exists only once a manager approves.
 */
export const createApplication = async (req: Request, res: Response) => {
  const user = currentUser(req);
  const { propertyId, ...details } = createApplicationSchema.parse(req.body);

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true },
  });
  if (!property) throw notFound("Property");

  const pending = await prisma.application.findFirst({
    where: { propertyId, tenantCognitoId: user.id, status: "Pending" },
    select: { id: true },
  });
  if (pending) {
    throw conflict("You already have a pending application for this property");
  }

  const application = await prisma.application.create({
    data: {
      ...details,
      applicationDate: new Date(),
      status: "Pending",
      property: { connect: { id: propertyId } },
      tenant: { connect: { cognitoId: user.id } },
    },
    include: applicationInclude,
  });

  res.status(201).json(formatApplication(application));
};

/**
 * Manager-only, and only for applications on the manager's own properties.
 * Approval creates the lease, links it to the application and adds the
 * tenant to the property, all in one transaction.
 */
export const updateApplicationStatus = async (req: Request, res: Response) => {
  const user = currentUser(req);
  const { id } = idParam.parse(req.params);
  const { status } = updateApplicationStatusSchema.parse(req.body);

  const application = await prisma.application.findUnique({
    where: { id },
    include: { property: true },
  });
  if (!application) throw notFound("Application");
  if (application.property.managerCognitoId !== user.id) throw forbidden();

  const updated = await prisma.$transaction(async (tx) => {
    if (status === "Approved" && application.leaseId === null) {
      const startDate = new Date();
      const lease = await tx.lease.create({
        data: {
          startDate,
          endDate: addOneYear(startDate),
          rent: application.property.pricePerMonth,
          deposit: application.property.securityDeposit,
          propertyId: application.propertyId,
          tenantCognitoId: application.tenantCognitoId,
        },
      });

      await tx.property.update({
        where: { id: application.propertyId },
        data: { tenants: { connect: { cognitoId: application.tenantCognitoId } } },
      });

      return tx.application.update({
        where: { id },
        data: { status, leaseId: lease.id },
        include: applicationInclude,
      });
    }

    return tx.application.update({
      where: { id },
      data: { status },
      include: applicationInclude,
    });
  });

  res.json(formatApplication(updated));
};
