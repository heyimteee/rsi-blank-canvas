const ORDER = ["RECEIVED", "ACK_SENT", "PENDING_DECISION", "DECIDED"];
const TERMINAL = { ACCEPTED: "success", JOB_POOL_OPEN: "success", COMPLETED: "success", REJECTED: "failed" };

export const TRACK_STEPS = ["Submitted", "Confirmation sent", "Under review", "Decided"];

export function requestPhase(status) {
  if (TERMINAL[status]) return { active: 3, terminal: TERMINAL[status] };
  const idx = ORDER.indexOf(status);
  const active = idx === -1 ? 0 : Math.min(idx, 2);
  return { active, terminal: null };
}
