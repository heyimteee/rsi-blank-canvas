import { describe, it, expect } from "vitest";
import { splitConcerns, validateMilestones } from "./review.js";

describe("splitConcerns", () => {
  it("splits lines and drops empties", () => {
    expect(splitConcerns("Copy\n\nPricing\n ")).toEqual([{ title: "Copy" }, { title: "Pricing" }]);
  });
  it("handles empty input", () => {
    expect(splitConcerns("")).toEqual([]);
  });
});

describe("validateMilestones", () => {
  it("passes on good list", () => {
    expect(validateMilestones([{ title: "Hero copy v2" }])).toBe(null);
  });
  it("flags empty list and short titles", () => {
    expect(validateMilestones([])).not.toBe(null);
    expect(validateMilestones([{ title: "x" }])).not.toBe(null);
  });
});
