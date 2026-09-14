import { Request, Response, NextFunction } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { HttpError } from "../lib/errors";

export type UserRole = "tenant" | "manager";

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;

if (!userPoolId || !clientId) {
  throw new Error(
    "COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set for token verification"
  );
}

/**
 * Verifies Cognito ID tokens. The verifier fetches the user pool's JWKS on
 * first use and caches it, then checks signature, expiry, issuer, audience
 * and token_use on every request.
 *
 * ID tokens are used (not access tokens) because custom attributes such as
 * `custom:role` are only present in the ID token.
 */
export const cognitoVerifier = CognitoJwtVerifier.create({
  userPoolId,
  clientId,
  tokenUse: "id",
});

const isUserRole = (value: unknown): value is UserRole =>
  value === "tenant" || value === "manager";

/** Authenticates the request and restricts it to the given roles. */
export const authMiddleware = (allowedRoles: UserRole[]) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const [scheme, token] = req.headers.authorization?.split(" ") ?? [];

    if (scheme !== "Bearer" || !token) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    let payload;
    try {
      payload = await cognitoVerifier.verify(token);
    } catch {
      // Signature, expiry, issuer, audience or token_use check failed.
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    const role = String(payload["custom:role"] ?? "").toLowerCase();
    if (!isUserRole(role)) {
      res.status(403).json({ message: "Access Denied" });
      return;
    }

    req.user = { id: payload.sub, role };

    if (!allowedRoles.includes(role)) {
      res.status(403).json({ message: "Access Denied" });
      return;
    }

    next();
  };
};

/**
 * Ensures the `:cognitoId` route param (or another named param) is the
 * authenticated user's own id, so a tenant cannot read or edit another
 * tenant's profile, favorites or residences by changing the URL.
 */
export const requireSelf = (param = "cognitoId") => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.params[param] !== req.user.id) {
      res.status(403).json({ message: "Access Denied" });
      return;
    }
    next();
  };
};

/** Returns the authenticated user or throws 401. Use inside controllers. */
export const currentUser = (req: Request): AuthenticatedUser => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  return req.user;
};
