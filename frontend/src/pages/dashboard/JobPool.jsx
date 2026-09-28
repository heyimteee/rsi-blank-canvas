import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import { listJobPool } from "../../lib/dashboard.js";

export default function JobPool() {
  const { token } = useAuth();
  const { push } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const out = await listJobPool(token);
        setItems(out.items || []);
      } catch (err) {
        setError(err.message);
        push(err.message, "error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, push]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Open job pool</h1>
      <p className="mt-1 text-sm text-zinc-500">Accepted requests that need a team. Pick one up with your lead.</p>
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
          <EmptyState title="No open jobs" body="Accepted requests will appear here once External Collaboration approves them." />
        </div>
      )}
      {!loading && items.length > 0 && (
        <ul className="mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {items.map((j) => (
            <li key={j.id} className="px-5 py-4">
              <p className="text-sm font-semibold text-zinc-900">
                <span className="mr-2 tabular-nums text-zinc-400">#{j.id}</span>
                {j.title}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">Opened {new Date(j.opened_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
