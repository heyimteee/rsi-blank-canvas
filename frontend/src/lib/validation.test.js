import { describe, it, expect } from "vitest";
import { isValidEmail, isValidDate, validateIntake, validateRevision } from "./validation.js";

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

describe("isValidDate", () => {
  it("accepts iso dates only", () => {
    expect(isValidDate("2026-10-05")).toBe(true);
    expect(isValidDate("05/10/2026")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });
});

describe("validateIntake", () => {
  const good = {
    client_name: "Budi",
    client_email: "budi@example.com",
    title: "Company site",
    details: "Need a company profile with contact form",
    budget_amount: "12.500.000",
    budget_currency: "IDR",
    deadline: "2026-10-05",
  };

  it("passes on good input", () => {
    expect(validateIntake(good)).toBe(null);
  });

  it("requires amount above zero", () => {
    expect(validateIntake({ ...good, budget_amount: "" })).not.toBe(null);
    expect(validateIntake({ ...good, budget_amount: "0" })).not.toBe(null);
  });

  it("requires a currency and a real deadline", () => {
    expect(validateIntake({ ...good, budget_currency: "" })).not.toBe(null);
    expect(validateIntake({ ...good, deadline: "" })).not.toBe(null);
    expect(validateIntake({ ...good, deadline: "next month" })).not.toBe(null);
  });

  it("flags missing fields", () => {
    expect(validateIntake({})).not.toBe(null);
  });
});

describe("validateRevision", () => {
  const good = {
    general_details: "Change hero copy and pricing table",
    delivery_date: "2026-10-20",
    new_budget_amount: "15.000.000",
    added_cost_amount: "2.500.000",
    budget_currency: "IDR",
  };

  it("passes on good input", () => {
    expect(validateRevision(good)).toBe(null);
  });

  it("accepts zero added cost", () => {
    expect(validateRevision({ ...good, added_cost_amount: "0" })).toBe(null);
  });

  it("requires a delivery date and both amounts", () => {
    expect(validateRevision({ ...good, delivery_date: "" })).not.toBe(null);
    expect(validateRevision({ ...good, new_budget_amount: "" })).not.toBe(null);
    expect(validateRevision({ ...good, added_cost_amount: "" })).not.toBe(null);
  });

  it("flags short input", () => {
    expect(validateRevision({ general_details: "x" })).not.toBe(null);
  });
});
