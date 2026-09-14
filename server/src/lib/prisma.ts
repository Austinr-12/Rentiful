import { PrismaClient } from "@prisma/client";

/**
 * One PrismaClient per process. Each instance owns its own connection pool,
 * so instantiating it per module (the previous pattern) multiplied open
 * connections by the number of controllers.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  // Survive ts-node / nodemon reloads without leaking connections.
  globalForPrisma.prisma = prisma;
}
