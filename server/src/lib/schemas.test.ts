import { describe, expect, it } from "vitest";
import {
  createApplicationSchema,
  createPropertySchema,
  idParam,
  propertyFiltersSchema,
  updateApplicationStatusSchema,
} from "./schemas";

describe("propertyFiltersSchema", () => {
  it("treats the client's 'any' sentinel and empty strings as absent", () => {
    const result = propertyFiltersSchema.parse({
      beds: "any",
      baths: "",
      propertyType: "any",
      priceMin: "",
    });

    expect(result.beds).toBeUndefined();
    expect(result.baths).toBeUndefined();
    expect(result.propertyType).toBeUndefined();
    expect(result.priceMin).toBeUndefined();
  });

  it("coerces numeric strings and splits comma-separated lists", () => {
    const result = propertyFiltersSchema.parse({
      priceMin: "1000",
      priceMax: "3000",
      beds: "2",
      amenities: "Pool,Gym",
      favoriteIds: "1,2,x,-4",
      latitude: "34.05",
      longitude: "-118.25",
    });

    expect(result.priceMin).toBe(1000);
    expect(result.priceMax).toBe(3000);
    expect(result.beds).toBe(2);
    expect(result.amenities).toEqual(["Pool", "Gym"]);
    expect(result.favoriteIds).toEqual([1, 2]);
    expect(result.latitude).toBeCloseTo(34.05);
    expect(result.longitude).toBeCloseTo(-118.25);
  });

  it("defaults the search radius to 50 km and caps it at 500", () => {
    expect(propertyFiltersSchema.parse({}).radiusKm).toBe(50);
    expect(propertyFiltersSchema.parse({ radiusKm: "120" }).radiusKm).toBe(120);
    expect(() => propertyFiltersSchema.parse({ radiusKm: "9999" })).toThrow();
  });

  it("rejects values outside the enum or numeric range", () => {
    expect(() => propertyFiltersSchema.parse({ amenities: "Pool,Helipad" })).toThrow();
    expect(() => propertyFiltersSchema.parse({ propertyType: "Castle" })).toThrow();
    expect(() => propertyFiltersSchema.parse({ beds: "abc" })).toThrow();
    expect(() => propertyFiltersSchema.parse({ latitude: "91" })).toThrow();
  });
});

describe("createPropertySchema (multipart form fields arrive as strings)", () => {
  const valid = {
    name: "Loft",
    description: "Bright loft",
    pricePerMonth: "2500",
    securityDeposit: "2500",
    applicationFee: "50",
    isPetsAllowed: "true",
    isParkingIncluded: "false",
    amenities: "Pool,Gym",
    highlights: "GreatView",
    beds: "2",
    baths: "1.5",
    squareFeet: "900",
    propertyType: "Apartment",
    address: "1 Main St",
    city: "Los Angeles",
    state: "CA",
    country: "United States",
    postalCode: "90001",
  };

  it("coerces booleans, numbers and enum lists", () => {
    const result = createPropertySchema.parse(valid);

    expect(result.isPetsAllowed).toBe(true);
    expect(result.isParkingIncluded).toBe(false);
    expect(result.pricePerMonth).toBe(2500);
    expect(result.baths).toBe(1.5);
    expect(result.amenities).toEqual(["Pool", "Gym"]);
    expect(result.highlights).toEqual(["GreatView"]);
  });

  it("rejects a missing address and an unknown amenity", () => {
    expect(() => createPropertySchema.parse({ ...valid, address: "" })).toThrow();
    expect(() => createPropertySchema.parse({ ...valid, amenities: "Moat" })).toThrow();
  });
});

describe("createApplicationSchema", () => {
  it("accepts a valid body and trims strings", () => {
    const result = createApplicationSchema.parse({
      propertyId: "7",
      name: "  Carol  ",
      email: "carol@example.com",
      phoneNumber: "5551234567",
    });

    expect(result.propertyId).toBe(7);
    expect(result.name).toBe("Carol");
    expect(result.message).toBeUndefined();
  });

  it("rejects an invalid email or short phone number", () => {
    expect(() =>
      createApplicationSchema.parse({
        propertyId: 1,
        name: "Carol",
        email: "not-an-email",
        phoneNumber: "5551234567",
      })
    ).toThrow();
    expect(() =>
      createApplicationSchema.parse({
        propertyId: 1,
        name: "Carol",
        email: "carol@example.com",
        phoneNumber: "123",
      })
    ).toThrow();
  });
});

describe("updateApplicationStatusSchema", () => {
  it("only accepts known statuses", () => {
    expect(updateApplicationStatusSchema.parse({ status: "Approved" }).status).toBe("Approved");
    expect(() => updateApplicationStatusSchema.parse({ status: "Maybe" })).toThrow();
  });
});

describe("idParam", () => {
  it("coerces numeric ids and rejects the rest", () => {
    expect(idParam.parse({ id: "12" }).id).toBe(12);
    expect(() => idParam.parse({ id: "abc" })).toThrow();
    expect(() => idParam.parse({ id: "0" })).toThrow();
  });
});
