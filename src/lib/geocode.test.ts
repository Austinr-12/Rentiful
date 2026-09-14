import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeLocation } from "./geocode";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const respondWith = (body: unknown, ok = true) =>
  fetchMock.mockResolvedValue({ ok, json: async () => body });

afterEach(() => fetchMock.mockReset());

describe("geocodeLocation", () => {
  it("returns [lng, lat] exactly as Mapbox orders them", async () => {
    respondWith({ features: [{ center: [-118.25, 34.05] }] });

    const result = await geocodeLocation("Los Angeles");

    expect(result).toEqual([-118.25, 34.05]);
  });

  it("returns null for a blank query without calling the network", async () => {
    expect(await geocodeLocation("   ")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when nothing matched", async () => {
    respondWith({ features: [] });
    expect(await geocodeLocation("Nowhereville")).toBeNull();
  });

  it("returns null on an HTTP error", async () => {
    respondWith({}, false);
    expect(await geocodeLocation("Paris")).toBeNull();
  });

  it("URL-encodes the query and asks for a single result", async () => {
    respondWith({ features: [{ center: [2.35, 48.85] }] });

    await geocodeLocation("New York, NY");

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(`/${encodeURIComponent("New York, NY")}.json`);
    expect(url).toContain("limit=1");
  });
});
