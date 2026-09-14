import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { cleanParams, formatEnumString, formatPriceValue, withToast } from "./utils";

describe("cleanParams", () => {
  it("drops undefined, empty, 'any' and null values", () => {
    expect(
      cleanParams({
        beds: "any",
        baths: "2",
        location: "",
        propertyType: undefined,
        availableFrom: null,
      })
    ).toEqual({ baths: "2" });
  });

  it("keeps a range tuple only when at least one bound is set", () => {
    expect(cleanParams({ priceRange: [null, null] })).toEqual({});
    expect(cleanParams({ priceRange: [1000, null] })).toEqual({ priceRange: [1000, null] });
  });

  it("keeps zero and false, which are real values", () => {
    expect(cleanParams({ priceMin: 0, isPetsAllowed: false })).toEqual({
      priceMin: 0,
      isPetsAllowed: false,
    });
  });
});

describe("formatPriceValue", () => {
  it("labels unset bounds", () => {
    expect(formatPriceValue(null, true)).toBe("Any Min Price");
    expect(formatPriceValue(0, false)).toBe("Any Max Price");
  });

  it("abbreviates thousands", () => {
    expect(formatPriceValue(1500, true)).toBe("$1.5k+");
    expect(formatPriceValue(3000, false)).toBe("<$3k");
  });

  it("leaves small amounts as-is", () => {
    expect(formatPriceValue(500, true)).toBe("$500+");
    expect(formatPriceValue(900, false)).toBe("<$900");
  });
});

describe("formatEnumString", () => {
  it("splits PascalCase enum names into words", () => {
    expect(formatEnumString("HighSpeedInternetAccess")).toBe("High Speed Internet Access");
    expect(formatEnumString("Pool")).toBe("Pool");
  });
});

describe("withToast", () => {
  it("shows the success message and returns the result", async () => {
    const result = await withToast(Promise.resolve(42), { success: "Saved" });

    expect(result).toBe(42);
    expect(toast.success).toHaveBeenCalledWith("Saved");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the error message and rethrows", async () => {
    await expect(withToast(Promise.reject(new Error("boom")), { error: "Failed" })).rejects.toThrow(
      "boom"
    );
    expect(toast.error).toHaveBeenCalledWith("Failed");
  });
});
