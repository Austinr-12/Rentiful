import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { verifyMock } from "../test/mocks";

vi.mock("aws-jwt-verify", async () => {
  const { verifyMock } = await import("../test/mocks");
  return { CognitoJwtVerifier: { create: () => ({ verify: verifyMock }) } };
});

import { authMiddleware, currentUser, requireSelf } from "./authMiddleware";
import { HttpError } from "../lib/errors";

const mockRes = () => {
  const res = {} as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const mockReq = (authorization?: string, params: Record<string, string> = {}) =>
  ({ headers: { authorization }, params } as unknown as Request);

describe("authMiddleware", () => {
  it("returns 401 when the Authorization header is missing", async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(["tenant"])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a non-Bearer scheme", async () => {
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(["tenant"])(mockReq("Basic abc"), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the token fails verification", async () => {
    verifyMock.mockRejectedValue(new Error("expired"));
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(["tenant"])(mockReq("Bearer bad"), res, next);

    expect(verifyMock).toHaveBeenCalledWith("bad");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid or expired token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when the verified token carries no role", async () => {
    verifyMock.mockResolvedValue({ sub: "u1" });
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(["tenant"])(mockReq("Bearer ok"), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when the role is not allowed for the route", async () => {
    verifyMock.mockResolvedValue({ sub: "u1", "custom:role": "tenant" });
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(["manager"])(mockReq("Bearer ok"), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches the user and calls next for an allowed role", async () => {
    verifyMock.mockResolvedValue({ sub: "u1", "custom:role": "Manager" });
    const req = mockReq("Bearer ok");
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(["manager", "tenant"])(req, res, next);

    expect(req.user).toEqual({ id: "u1", role: "manager" });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("requireSelf", () => {
  it("rejects a request for another user's id", () => {
    const req = mockReq(undefined, { cognitoId: "someone-else" });
    req.user = { id: "me", role: "tenant" };
    const res = mockRes();
    const next = vi.fn();

    requireSelf()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects when no user is attached", () => {
    const res = mockRes();
    const next = vi.fn();

    requireSelf()(mockReq(undefined, { cognitoId: "me" }), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes when the param matches the authenticated user", () => {
    const req = mockReq(undefined, { cognitoId: "me" });
    req.user = { id: "me", role: "tenant" };
    const res = mockRes();
    const next = vi.fn();

    requireSelf()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("currentUser", () => {
  it("returns the attached user", () => {
    const req = mockReq();
    req.user = { id: "me", role: "manager" };
    expect(currentUser(req)).toEqual({ id: "me", role: "manager" });
  });

  it("throws a 401 HttpError when no user is attached", () => {
    expect(() => currentUser(mockReq())).toThrowError(HttpError);
    try {
      currentUser(mockReq());
    } catch (err) {
      expect((err as HttpError).status).toBe(401);
    }
  });
});
