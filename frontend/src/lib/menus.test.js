import { describe, it, expect } from "vitest";
import { navLinks, isPublicOnly, homePath } from "./menus.js";

describe("navLinks", () => {
  it("shows public links when logged out", () => {
    const links = navLinks({ isAuthenticated: false, role: null });
    expect(links.map((l) => l.to)).toEqual(["/", "/request", "/track", "/revision/new"]);
  });
  it("tailors links for exc", () => {
    const links = navLinks({ isAuthenticated: true, role: "exc" });
    expect(links.map((l) => l.to)).toEqual(["/", "/dashboard/requests", "/dashboard/jobs", "/dashboard/overview"]);
  });
  it("tailors links for members with pm extras", () => {
    const fe = navLinks({ isAuthenticated: true, role: "fe" });
    expect(fe.map((l) => l.to)).toEqual(["/", "/dashboard/pool", "/dashboard/my-work"]);
    const pm = navLinks({ isAuthenticated: true, role: "pm" });
    expect(pm.map((l) => l.to)).toContain("/dashboard/revisions");
    expect(pm.map((l) => l.to)).toContain("/dashboard/pool");
  });
});

describe("isPublicOnly", () => {
  it("marks request and revision as client only", () => {
    expect(isPublicOnly("/request")).toBe(true);
    expect(isPublicOnly("/revision/new")).toBe(true);
    expect(isPublicOnly("/track")).toBe(false);
    expect(isPublicOnly("/dashboard/pool")).toBe(false);
  });
});

describe("homePath", () => {
  it("resolves landing for guests and boards for roles", () => {
    expect(homePath({ isAuthenticated: false })).toBe("/");
    expect(homePath({ isAuthenticated: true, role: "exc" })).toBe("/dashboard/requests");
    expect(homePath({ isAuthenticated: true, role: "pm" })).toBe("/dashboard/my-work");
    expect(homePath({ isAuthenticated: true, role: "fe" })).toBe("/dashboard/pool");
  });
});
