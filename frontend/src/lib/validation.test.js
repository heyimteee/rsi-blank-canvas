import { describe, it, expect } from "vitest";
import { isValidEmail, validateIntake, validateRevision } from "./validation.js";

describe("isValidEmail", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("name@example.com")).toBe(true);
  });
  it("rejects invalid emails", () => {
    expect(isValidEmail("bad")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("validateIntake", () => {
  it("passes on good input", () => {
    const out = validateIntake({
      client_name: "Budi",
      client_email: "budi@example.com",
      title: "Company site",
      details: "Need a company profile with contact form",
    });
    expect(out).toBe(null);
  });
  it("flags missing fields", () => {
    expect(validateIntake({})).not.toBe(null);
    expect(
      validateIntake({ client_name: "B", client_email: "x", title: "T", details: "D" })
    ).not.toBe(null);
  });
});

describe("validateRevision", () => {
  it("passes on good input", () => {
    const out = validateRevision({
      general_details: "Change hero copy and pricing table",
      terms: "Within scope",
    });
    expect(out).toBe(null);
  });
  it("flags short input", () => {
    expect(validateRevision({ general_details: "x", terms: "y" })).not.toBe(null);
  });
});
