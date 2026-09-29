const SEATS = ["pm", "fe", "be", "pd"];

export const ROLE_LABEL = {
  pm: "Project Manager",
  fe: "Front End Developer",
  be: "Back End Developer",
  pd: "Product Designer",
  unassigned: "Unassigned",
};

export const FILTER_ROLES = ["fe", "be", "pm", "pd", "unassigned"];
export const ALL_ROLES = [...FILTER_ROLES];

export function toggleRole(list, role) {
  return list.includes(role) ? list.filter((r) => r !== role) : [...list, role];
}

export function taskMatchesRole(task, role) {
  if (role === "unassigned") return !task.assignee_role && !task.assignee_id;
  return task.assignee_role === role;
}

export function filterTasks(tasks, activeRoles) {
  return tasks.filter((t) => activeRoles.some((role) => taskMatchesRole(t, role)));
}

export function isOverdue(task, today) {
  if (!task || !task.deadline || task.status === "DONE") return false;
  return String(task.deadline).slice(0, 10) < today;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

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
