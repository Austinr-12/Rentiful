import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", async () => {
  const { prismaMock } = await import("../test/mocks");
  return { prisma: prismaMock };
});

import { addOneYear, nextPaymentDate } from "./applicationControllers";

describe("nextPaymentDate", () => {
  it("returns the first monthly anniversary strictly after today", () => {
    const start = new Date("2026-01-15T00:00:00Z");
    const today = new Date("2026-09-13T12:00:00Z");

    expect(nextPaymentDate(start, today).toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("returns the start date itself when the lease has not started", () => {
    const start = new Date("2027-03-01T00:00:00Z");
    const today = new Date("2026-09-13T00:00:00Z");

    expect(nextPaymentDate(start, today).getTime()).toBe(start.getTime());
  });

  it("rolls to the next month when today is exactly a payment day", () => {
    const start = new Date("2026-01-15T00:00:00Z");
    const today = new Date("2026-09-15T00:00:00Z");

    expect(nextPaymentDate(start, today).toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });

  it("does not mutate the start date", () => {
    const start = new Date("2026-01-15T00:00:00Z");
    nextPaymentDate(start, new Date("2026-09-13T00:00:00Z"));
    expect(start.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
});

describe("addOneYear", () => {
  it("adds exactly one calendar year", () => {
    expect(addOneYear(new Date("2026-03-01T00:00:00Z")).toISOString()).toBe(
      "2027-03-01T00:00:00.000Z"
    );
  });
});
