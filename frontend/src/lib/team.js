const SEATS = ["pm", "fe", "be", "pd"];

export function applyBlockReason({ userRole, seat, hasActiveJob, hasPending }) {
  if (!SEATS.includes(userRole)) return "no-seat";
  if (!seat || seat.role !== userRole) return "seat-mismatch";
  if (seat.status !== "OPEN") return "seat-taken";
  if (hasPending) return "already-pending";
  if (hasActiveJob) return "already-staffed";
  return null;
}

export function blockMessage(reason) {
  if (reason === "no-seat") return "Your role has no seat in this pool.";
  if (reason === "seat-mismatch") return "This seat is for another discipline.";
  if (reason === "seat-taken") return "This seat is already filled.";
  if (reason === "already-pending") return "Your application is waiting for EXC review.";
  if (reason === "already-staffed") return "You already hold an active job.";
  return "";
}
