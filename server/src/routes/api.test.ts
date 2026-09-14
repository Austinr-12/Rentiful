import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MANAGER_ID,
  TENANT_ID,
  prismaMock,
  rejectTokens,
  signInAs,
  signInWithoutRole,
} from "../test/mocks";

vi.mock("aws-jwt-verify", async () => {
  const { verifyMock } = await import("../test/mocks");
  return { CognitoJwtVerifier: { create: () => ({ verify: verifyMock }) } };
});

vi.mock("../lib/prisma", async () => {
  const { prismaMock } = await import("../test/mocks");
  return { prisma: prismaMock };
});

import { app } from "../app";

const api = () => request(app);

describe("GET /health", () => {
  it("responds 200 without authentication", async () => {
    const res = await api().get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("authentication", () => {
  it("rejects a missing token with 401", async () => {
    const res = await api().get("/applications");
    expect(res.status).toBe(401);
  });

  it("rejects a non-Bearer scheme with 401", async () => {
    const res = await api().get("/applications").set("Authorization", "Basic abc");
    expect(res.status).toBe(401);
  });

  it("rejects a token that fails verification with 401", async () => {
    rejectTokens();
    const res = await api().get("/applications").set("Authorization", "Bearer forged");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid or expired token");
  });

  it("rejects a verified token without a role with 403", async () => {
    const res = await api().get("/applications").set(signInWithoutRole());
    expect(res.status).toBe(403);
  });

  it("does not let a tenant use manager routes", async () => {
    const res = await api().get(`/managers/${TENANT_ID}`).set(signInAs("tenant"));
    expect(res.status).toBe(403);
    expect(prismaMock.manager.findUnique).not.toHaveBeenCalled();
  });
});

describe("ownership", () => {
  it("blocks a tenant from reading another tenant's profile", async () => {
    const res = await api().get("/tenants/someone-else").set(signInAs("tenant"));
    expect(res.status).toBe(403);
    expect(prismaMock.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("lets a tenant read their own profile with favorite ids only", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      id: 1,
      cognitoId: TENANT_ID,
      name: "Carol",
      email: "carol@example.com",
      phoneNumber: "",
      favorites: [{ id: 3 }],
    });

    const res = await api().get(`/tenants/${TENANT_ID}`).set(signInAs("tenant"));

    expect(res.status).toBe(200);
    expect(res.body.favorites).toEqual([{ id: 3 }]);
    expect(prismaMock.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cognitoId: TENANT_ID } })
    );
  });

  it("blocks a tenant from favoriting on behalf of another tenant", async () => {
    const res = await api().post("/tenants/other/favorites/1").set(signInAs("tenant"));
    expect(res.status).toBe(403);
    expect(prismaMock.tenant.update).not.toHaveBeenCalled();
  });

  it("creates the profile for the token's user, ignoring any id in the body", async () => {
    prismaMock.tenant.upsert.mockResolvedValue({ id: 1, cognitoId: TENANT_ID, favorites: [] });

    const res = await api()
      .post("/tenants")
      .set(signInAs("tenant"))
      .send({ cognitoId: "spoofed", name: "Carol", email: "carol@example.com" });

    expect(res.status).toBe(201);
    expect(prismaMock.tenant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cognitoId: TENANT_ID } })
    );
  });

  it("blocks a manager from listing leases on a property they do not own", async () => {
    prismaMock.property.findUnique.mockResolvedValue({ managerCognitoId: "another-manager" });

    const res = await api().get("/properties/1/leases").set(signInAs("manager"));

    expect(res.status).toBe(403);
    expect(prismaMock.lease.findMany).not.toHaveBeenCalled();
  });

  it("lets a manager list leases with payments on their own property", async () => {
    prismaMock.property.findUnique.mockResolvedValue({ managerCognitoId: MANAGER_ID });
    prismaMock.lease.findMany.mockResolvedValue([{ id: 9, tenant: {}, payments: [] }]);

    const res = await api().get("/properties/1/leases").set(signInAs("manager"));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(prismaMock.lease.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { propertyId: 1 } })
    );
  });

  it("blocks tenants from the property leases route entirely", async () => {
    const res = await api().get("/properties/1/leases").set(signInAs("tenant"));
    expect(res.status).toBe(403);
  });

  it("scopes lease payments to the lease's tenant", async () => {
    prismaMock.lease.findUnique.mockResolvedValue({
      tenantCognitoId: "other-tenant",
      property: { managerCognitoId: MANAGER_ID },
    });

    const res = await api().get("/leases/5/payments").set(signInAs("tenant"));

    expect(res.status).toBe(403);
    expect(prismaMock.payment.findMany).not.toHaveBeenCalled();
  });
});

describe("applications", () => {
  const ownApplication = {
    id: 1,
    leaseId: null,
    propertyId: 5,
    tenantCognitoId: TENANT_ID,
    property: { id: 5, managerCognitoId: MANAGER_ID, pricePerMonth: 1500, securityDeposit: 1500 },
  };

  const updatedRow = {
    ...ownApplication,
    status: "Approved",
    leaseId: 77,
    property: { ...ownApplication.property, location: { address: "1 Main St" }, manager: { id: 2 } },
    tenant: { id: 3 },
    lease: { id: 77, startDate: new Date("2026-01-01T00:00:00Z") },
  };

  beforeEach(() => {
    prismaMock.application.findMany.mockResolvedValue([]);
  });

  it("scopes a tenant's list to their own applications", async () => {
    const res = await api().get("/applications").set(signInAs("tenant"));

    expect(res.status).toBe(200);
    expect(prismaMock.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantCognitoId: TENANT_ID } })
    );
  });

  it("scopes a manager's list to applications on their properties", async () => {
    await api().get("/applications").set(signInAs("manager"));

    expect(prismaMock.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { property: { managerCognitoId: MANAGER_ID } } })
    );
  });

  it("includes the lease in the same query (no per-row lookups)", async () => {
    await api().get("/applications").set(signInAs("tenant"));

    expect(prismaMock.application.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.lease.findFirst).not.toHaveBeenCalled();
    const args = prismaMock.application.findMany.mock.calls[0][0];
    expect(args.include.lease).toBe(true);
  });

  it("rejects an application with missing fields", async () => {
    const res = await api().post("/applications").set(signInAs("tenant")).send({ propertyId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("prevents a second pending application for the same property", async () => {
    prismaMock.property.findUnique.mockResolvedValue({ id: 1 });
    prismaMock.application.findFirst.mockResolvedValue({ id: 2 });

    const res = await api().post("/applications").set(signInAs("tenant")).send({
      propertyId: 1,
      name: "Carol",
      email: "carol@example.com",
      phoneNumber: "5551234567",
    });

    expect(res.status).toBe(409);
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("does not create a lease when an application is submitted", async () => {
    prismaMock.property.findUnique.mockResolvedValue({ id: 1 });
    prismaMock.application.findFirst.mockResolvedValue(null);
    prismaMock.application.create.mockResolvedValue({
      ...updatedRow,
      status: "Pending",
      leaseId: null,
      lease: null,
    });

    const res = await api().post("/applications").set(signInAs("tenant")).send({
      propertyId: 1,
      name: "Carol",
      email: "carol@example.com",
      phoneNumber: "5551234567",
    });

    expect(res.status).toBe(201);
    expect(res.body.lease).toBeNull();
    expect(prismaMock.lease.create).not.toHaveBeenCalled();
    const data = prismaMock.application.create.mock.calls[0][0].data;
    expect(data.status).toBe("Pending");
    expect(data.tenant).toEqual({ connect: { cognitoId: TENANT_ID } });
  });

  it("blocks a manager from approving an application on another manager's property", async () => {
    prismaMock.application.findUnique.mockResolvedValue({
      ...ownApplication,
      property: { ...ownApplication.property, managerCognitoId: "another-manager" },
    });

    const res = await api()
      .put("/applications/1/status")
      .set(signInAs("manager"))
      .send({ status: "Approved" });

    expect(res.status).toBe(403);
    expect(prismaMock.lease.create).not.toHaveBeenCalled();
    expect(prismaMock.application.update).not.toHaveBeenCalled();
  });

  it("approval creates the lease, links the tenant and updates the application in one transaction", async () => {
    prismaMock.application.findUnique.mockResolvedValue(ownApplication);
    prismaMock.lease.create.mockResolvedValue({ id: 77 });
    prismaMock.property.update.mockResolvedValue({});
    prismaMock.application.update.mockResolvedValue(updatedRow);

    const res = await api()
      .put("/applications/1/status")
      .set(signInAs("manager"))
      .send({ status: "Approved" });

    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.lease.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.lease.create.mock.calls[0][0].data).toMatchObject({
      rent: 1500,
      deposit: 1500,
      propertyId: 5,
      tenantCognitoId: TENANT_ID,
    });
    expect(prismaMock.property.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: { tenants: { connect: { cognitoId: TENANT_ID } } },
      })
    );
    expect(prismaMock.application.update.mock.calls[0][0].data).toEqual({
      status: "Approved",
      leaseId: 77,
    });
    expect(res.body.lease.nextPaymentDate).toBeDefined();
    expect(res.body.property.address).toBe("1 Main St");
  });

  it("denial only updates the status", async () => {
    prismaMock.application.findUnique.mockResolvedValue(ownApplication);
    prismaMock.application.update.mockResolvedValue({ ...updatedRow, status: "Denied", lease: null });

    const res = await api()
      .put("/applications/1/status")
      .set(signInAs("manager"))
      .send({ status: "Denied" });

    expect(res.status).toBe(200);
    expect(prismaMock.lease.create).not.toHaveBeenCalled();
    expect(prismaMock.application.update.mock.calls[0][0].data).toEqual({ status: "Denied" });
  });

  it("rejects an unknown status with 400", async () => {
    const res = await api()
      .put("/applications/1/status")
      .set(signInAs("manager"))
      .send({ status: "Maybe" });

    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe("status");
  });
});

describe("property search", () => {
  it("rejects a non-numeric filter", async () => {
    const res = await api().get("/properties?beds=abc");
    expect(res.status).toBe(400);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("rejects an unknown property type", async () => {
    const res = await api().get("/properties?propertyType=Castle");
    expect(res.status).toBe(400);
  });

  it("runs valid filters as a single query", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    const res = await api().get("/properties?beds=2&priceMax=3000&amenities=Pool");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for an unknown property id", async () => {
    prismaMock.property.findUnique.mockResolvedValue(null);
    const res = await api().get("/properties/999");
    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric property id", async () => {
    const res = await api().get("/properties/abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await api().get("/nope");
    expect(res.status).toBe(404);
  });
});
