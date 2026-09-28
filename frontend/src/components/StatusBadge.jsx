const MAP = {
  RECEIVED: "bg-yellow-50 text-yellow-800 border-yellow-200",
  ACK_SENT: "bg-blue-50 text-blue-800 border-blue-200",
  PENDING_DECISION: "bg-blue-50 text-blue-800 border-blue-200",
  ACCEPTED: "bg-green-50 text-green-800 border-green-200",
  JOB_POOL_OPEN: "bg-green-50 text-green-800 border-green-200",
  REJECTED: "bg-red-50 text-red-800 border-red-200",
  NOTIFIED_PM: "bg-blue-50 text-blue-800 border-blue-200",
  UNDER_REVIEW: "bg-blue-50 text-blue-800 border-blue-200",
  SEPARATED: "bg-blue-50 text-blue-800 border-blue-200",
  MILESTONES_UPDATED: "bg-blue-50 text-blue-800 border-blue-200",
  LOGGED: "bg-zinc-100 text-zinc-700 border-zinc-200",
  ACCEPTED_NOTIFIED: "bg-green-50 text-green-800 border-green-200",
  REJECTED_NOTIFIED: "bg-red-50 text-red-800 border-red-200",
  OPEN: "bg-zinc-100 text-zinc-700 border-zinc-200",
  IN_PROGRESS: "bg-blue-50 text-blue-800 border-blue-200",
  DONE: "bg-green-50 text-green-800 border-green-200",
  REVISED: "bg-yellow-50 text-yellow-800 border-yellow-200",
};

export default function StatusBadge({ status }) {
  const cls = MAP[status] || "bg-zinc-100 text-zinc-700 border-zinc-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}
