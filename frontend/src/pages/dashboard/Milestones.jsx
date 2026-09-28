import { useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import Field, { inputCls } from "../../components/Field.jsx";
import { listMilestones, updateMilestone } from "../../lib/dashboard.js";

export default function Milestones() {
  const { token, user } = useAuth();
  const { push } = useToast();
  const [requestId, setRequestId] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canEdit = user && (user.role === "pm" || user.role === "admin");

  async function load(e) {
    if (e) e.preventDefault();
    if (!requestId.trim()) {
      setError("Enter a request ID.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const out = await listMilestones(token, requestId.trim());
      setItems(out.items || []);
    } catch (err) {
      setError(err.message);
      push(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(id, status) {
    try {
      const out = await updateMilestone(token, id, status);
      setItems((prev) => prev.map((m) => (m.id === id ? out : m)));
      push("Milestone updated.");
    } catch (err) {
      push(err.message, "error");
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Milestones</h1>
      <p className="mt-1 text-sm text-zinc-500">Track progress per request. Project managers can update status.</p>
      <form onSubmit={load} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="w-full sm:max-w-xs">
          <Field label="Request ID">
            <input className={`${inputCls} tabular-nums`} value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="e.g. 12" inputMode="numeric" />
          </Field>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 sm:mt-6"
        >
          {loading ? "Loading..." : "Load"}
        </button>
      </form>
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <div className="mt-6 flex flex-col gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      )}
      {!loading && items.length === 0 && !error && requestId && (
        <div className="mt-6">
          <EmptyState title="No milestones yet" body="Milestones appear here after a revision is accepted." />
        </div>
      )}
      {!loading && items.length > 0 && (
        <ul className="mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {items.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">{m.title}</p>
                {m.description && <p className="mt-0.5 text-xs text-zinc-500">{m.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={m.status} />
                {canEdit && (
                  <select
                    value={m.status}
                    onChange={(e) => changeStatus(m.id, e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-400"
                    aria-label={`Update milestone ${m.id}`}
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="DONE">DONE</option>
                    <option value="REVISED">REVISED</option>
                  </select>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
