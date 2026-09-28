import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import { listRevisions } from "../../lib/dashboard.js";

export default function Revisions() {
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
        const out = await listRevisions(token, status || undefined);
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

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Revisions</h1>
          <p className="mt-1 text-sm text-zinc-500">Split concerns, update milestones, then accept or reject.</p>
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-zinc-400"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="NOTIFIED_PM">New</option>
          <option value="REJECTED">Rejected</option>
          <option value="ACCEPTED_NOTIFIED">Accepted</option>
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
      {!loading && items.length === 0 && !error && (
        <div className="mt-6">
          <EmptyState title="No revisions found" body="Client revision requests will appear here for review." />
        </div>
      )}
      {!loading && items.length > 0 && (
        <ul className="mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {items.map((r) => (
            <li key={r.id}>
              <Link to={`/dashboard/revisions/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-zinc-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    <span className="mr-2 tabular-nums text-zinc-400">#{r.id}</span>
                    Request <span className="tabular-nums">#{r.service_request_id}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{r.general_details}</p>
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
