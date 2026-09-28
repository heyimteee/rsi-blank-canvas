import { describe, it, expect } from "vitest";
import { requestPhase } from "./phases.js";

describe("requestPhase", () => {
  it("advances the active step with status", () => {
    expect(requestPhase("RECEIVED").active).toBe(0);
    expect(requestPhase("ACK_SENT").active).toBe(1);
    expect(requestPhase("PENDING_DECISION").active).toBe(2);
    expect(requestPhase("ACCEPTED").active).toBe(3);
  });
  it("marks terminal tones", () => {
    expect(requestPhase("ACCEPTED").terminal).toBe("success");
    expect(requestPhase("COMPLETED").terminal).toBe("success");
    expect(requestPhase("REJECTED").terminal).toBe("failed");
    expect(requestPhase("PENDING_DECISION").terminal).toBe(null);
  });
  it("falls back safely", () => {
    expect(requestPhase("NOPE").active).toBe(0);
  });
});
