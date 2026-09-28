import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import { listRequests } from "../../lib/dashboard.js";

export default function Overview() {
  const { token } = useAuth();
  const { push } = useToast();
  const [status, setStatus] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const out = await listRequests(token, status || undefined);
        setItems(out.items || []);
      } catch (err) {
        setError(err.message);
        push(err.message, "error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, status, push]);

  function detailLink(r) {
    return r.status === "ACCEPTED" ? `/dashboard/jobs/${r.id}` : `/dashboard/requests/${r.id}`;
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Tracking board</h1>
          <p className="mt-1 text-sm text-zinc-500">Every project and its current state. Select one for specifics.</p>
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-zinc-400"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="PENDING_DECISION">Pending</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="REJECTED">Rejected</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <div className="mt-6 flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {!loading && (
        <ul className="mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {items.map((r) => (
            <li key={r.id}>
              <Link to={detailLink(r)} className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-zinc-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    <span className="mr-2 tabular-nums text-zinc-400">#{r.id}</span>
                    {r.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {r.client_name} · <span className="tabular-nums">{new Date(r.created_at).toLocaleDateString()}</span>
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
