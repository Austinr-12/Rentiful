import { vi } from "vitest";

/**
 * Shared doubles for the two external boundaries: Cognito token
 * verification and the database. Test files install them with `vi.mock`
 * (see api.test.ts) so the real network and Postgres are never touched.
 */

export const verifyMock = vi.fn();

const model = () => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
});

export const prismaMock = {
  tenant: model(),
  manager: model(),
  property: model(),
  application: model(),
  lease: model(),
  payment: model(),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  // Interactive transactions receive the same mock as the `tx` client.
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
};

export const TENANT_ID = "tenant-cognito-123";
export const MANAGER_ID = "manager-cognito-456";

/** Make the mocked verifier accept the next token as the given user. */
export function signInAs(
  role: "tenant" | "manager",
  sub = role === "tenant" ? TENANT_ID : MANAGER_ID
) {
  verifyMock.mockResolvedValue({ sub, "custom:role": role });
  return { Authorization: "Bearer test-token" };
}

/** A verified token whose user has no role claim at all. */
export function signInWithoutRole(sub = "nobody") {
  verifyMock.mockResolvedValue({ sub });
  return { Authorization: "Bearer test-token" };
}

/** Make the mocked verifier reject every token. */
export function rejectTokens() {
  verifyMock.mockRejectedValue(new Error("Token signature invalid"));
}
