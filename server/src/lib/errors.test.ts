import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { HttpError, conflict, errorHandler, forbidden, notFound } from "./errors";

const mockRes = () => {
  const res = {} as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const run = (err: unknown) => {
  const res = mockRes();
  errorHandler(err, {} as Request, res, vi.fn());
  return res;
};

afterEach(() => vi.restoreAllMocks());

describe("HttpError helpers", () => {
  it("build errors with the expected status codes", () => {
    expect(notFound("Tenant")).toMatchObject({ status: 404, message: "Tenant not found" });
    expect(forbidden()).toMatchObject({ status: 403, message: "Access Denied" });
    expect(conflict("dup")).toMatchObject({ status: 409, message: "dup" });
    expect(new HttpError(422, "x")).toBeInstanceOf(Error);
  });
});

describe("errorHandler", () => {
  it("uses the status and message of an HttpError", () => {
    const res = run(new HttpError(418, "teapot"));
    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({ message: "teapot" });
  });

  it("maps zod validation errors to 400 with field paths", () => {
    const zodError = z.object({ email: z.string().email() }).safeParse({ email: "nope" });
    if (zodError.success) throw new Error("expected failure");

    const res = run(zodError.error);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe("Validation failed");
    expect(body.issues[0].path).toBe("email");
  });

  it("maps Prisma 'record not found' to 404 and unique violations to 409", () => {
    const notFoundErr = new Prisma.PrismaClientKnownRequestError("missing", {
      code: "P2025",
      clientVersion: "6.13.0",
    });
    const uniqueErr = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "6.13.0",
    });

    expect(run(notFoundErr).status).toHaveBeenCalledWith(404);
    expect(run(uniqueErr).status).toHaveBeenCalledWith(409);
  });

  it("hides unknown errors behind a generic 500 and logs them", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = run(new Error("db exploded"));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Internal server error" });
    expect(log).toHaveBeenCalled();
  });
});
