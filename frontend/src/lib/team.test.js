import { describe, it, expect } from "vitest";
import { applyBlockReason } from "./team.js";

describe("applyBlockReason", () => {
  it("allows a matching free member", () => {
    expect(applyBlockReason({ userRole: "fe", seat: { role: "fe", status: "OPEN" }, hasActiveJob: false, hasPending: false })).toBe(null);
  });
  it("blocks mismatched discipline", () => {
    expect(applyBlockReason({ userRole: "fe", seat: { role: "be", status: "OPEN" }, hasActiveJob: false, hasPending: false })).toBe("seat-mismatch");
  });
  it("blocks taken seats and busy members", () => {
    expect(applyBlockReason({ userRole: "fe", seat: { role: "fe", status: "FILLED" }, hasActiveJob: false, hasPending: false })).toBe("seat-taken");
    expect(applyBlockReason({ userRole: "fe", seat: { role: "fe", status: "OPEN" }, hasActiveJob: true, hasPending: false })).toBe("already-staffed");
    expect(applyBlockReason({ userRole: "fe", seat: { role: "fe", status: "OPEN" }, hasActiveJob: false, hasPending: true })).toBe("already-pending");
  });
  it("blocks roles without seats", () => {
    expect(applyBlockReason({ userRole: "exc", seat: { role: "fe", status: "OPEN" }, hasActiveJob: false, hasPending: false })).toBe("no-seat");
  });
});
