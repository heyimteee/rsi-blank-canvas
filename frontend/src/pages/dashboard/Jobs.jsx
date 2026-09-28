import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import { listJobPool, listSlots } from "../../lib/dashboard.js";

export default function Jobs() {
  const { token } = useAuth();
  const { push } = useToast();
  const [jobs, setJobs] = useState([]);
  const [fills, setFills] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const pool = await listJobPool(token);
        setJobs(pool.items || []);
        const entries = await Promise.all((pool.items || []).map(async (j) => [j.id, await listSlots(token, j.id)]));
        const map = {};
        for (const [id, s] of entries) {
          const slots = s.slots || [];
          map[id] = `${slots.filter((x) => x.status === "FILLED").length}/${slots.length} seats filled`;
        }
        setFills(map);
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
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Opened jobs</h1>
      <p className="mt-1 text-sm text-zinc-500">Every accepted project and how its team is staffing.</p>
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
      {!loading && jobs.length === 0 && !error && (
        <div className="mt-6">
          <EmptyState title="No opened jobs" body="Accepted requests will appear here with their teams." />
        </div>
      )}
      {!loading && jobs.length > 0 && (
        <ul className="mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link to={`/dashboard/jobs/${j.id}`} className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-zinc-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    <span className="mr-2 tabular-nums text-zinc-400">#{j.id}</span>
                    {j.title}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">{fills[j.id] || "Loading seats..."}</p>
                </div>
                <span className="text-sm text-zinc-400">Open</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
