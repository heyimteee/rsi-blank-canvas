import { describe, it, expect } from "vitest";
import { ALL_ROLES, toggleRole, filterTasks, isOverdue, taskMatchesRole } from "./team.js";

describe("role filter", () => {
  const tasks = [
    { id: 1, assignee_role: "fe" },
    { id: 2, assignee_role: "be" },
    { id: 3, assignee_role: "pm" },
    { id: 4, assignee_role: null },
  ];

  it("shows everything when all boxes are on", () => {
    expect(filterTasks(tasks, ALL_ROLES).map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });

  it("narrows to a single role plus unassigned when requested", () => {
    expect(filterTasks(tasks, ["fe", "unassigned"]).map((t) => t.id)).toEqual([1, 4]);
  });

  it("returns nothing when nothing is selected", () => {
    expect(filterTasks(tasks, []).map((t) => t.id)).toEqual([]);
  });

  it("toggles a role without mutating the source", () => {
    const next = toggleRole(ALL_ROLES, "fe");
    expect(next).not.toContain("fe");
    expect(ALL_ROLES).toContain("fe");
    expect(toggleRole(next, "fe")).toContain("fe");
  });

  it("matches unassigned work only under the unassigned box", () => {
    expect(taskMatchesRole({ assignee_role: null }, "unassigned")).toBe(true);
    expect(taskMatchesRole({ assignee_role: null }, "fe")).toBe(false);
  });
});

describe("overdue hint", () => {
  it("flags an open task past its deadline", () => {
    expect(isOverdue({ deadline: "2020-01-01", status: "OPEN" }, "2026-01-01")).toBe(true);
  });
  it("ignores done tasks and missing deadlines", () => {
    expect(isOverdue({ deadline: "2020-01-01", status: "DONE" }, "2026-01-01")).toBe(false);
    expect(isOverdue({ deadline: null, status: "OPEN" }, "2026-01-01")).toBe(false);
  });
});
