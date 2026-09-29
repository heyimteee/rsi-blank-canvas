import { describe, it, expect } from "vitest";
import { formatAmountInput, parseAmount, formatMoney } from "./money.js";

describe("formatAmountInput", () => {
  it("groups thousands with dots", () => {
    expect(formatAmountInput("12500000")).toBe("12.500.000");
    expect(formatAmountInput("1000")).toBe("1.000");
    expect(formatAmountInput("999")).toBe("999");
  });
  it("strips anything that is not a digit", () => {
    expect(formatAmountInput("Rp 12.500.000")).toBe("12.500.000");
    expect(formatAmountInput("abc")).toBe("");
    expect(formatAmountInput("12 500")).toBe("12.500");
  });
  it("keeps an empty string empty", () => {
    expect(formatAmountInput("")).toBe("");
  });
});

describe("parseAmount", () => {
  it("reads grouped text back to a number", () => {
    expect(parseAmount("12.500.000")).toBe(12500000);
    expect(parseAmount("1,000")).toBe(1000);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("nope")).toBe(0);
  });
});

describe("formatMoney", () => {
  it("renders currency for display", () => {
    expect(formatMoney(12500000, "IDR")).toMatch(/12\.500\.000/);
    expect(formatMoney(1500, "USD")).toMatch(/1,500/);
  });
  it("handles missing values", () => {
    expect(formatMoney(null, "IDR")).toBe("Not set");
  });
});
