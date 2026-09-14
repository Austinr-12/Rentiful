import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

/** Throw from a controller to send a specific HTTP status with a message. */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);
export const forbidden = (message = "Access Denied") => new HttpError(403, message);
export const conflict = (message: string) => new HttpError(409, message);

/** Catch-all for unknown routes. Mount after every router. */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` });
};

/**
 * Central error handler. Express 5 forwards rejected promises from async
 * handlers here automatically, so controllers no longer need try/catch.
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed",
      issues: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025: record required by the operation was not found.
    // P2002: unique constraint violation.
    // P2003: foreign key constraint violation (e.g. connecting to a missing row).
    if (err.code === "P2025") {
      res.status(404).json({ message: "Record not found" });
      return;
    }
    if (err.code === "P2002") {
      res.status(409).json({ message: "Record already exists" });
      return;
    }
    if (err.code === "P2003") {
      res.status(400).json({ message: "Related record does not exist" });
      return;
    }
  }

  console.error(err);
  res.status(500).json({ message: "Internal server error" });
};
