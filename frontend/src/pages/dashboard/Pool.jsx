import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import { listJobPool, listSlots, applyToJob, myActiveJob } from "../../lib/dashboard.js";
import { applyBlockReason, blockMessage } from "../../lib/team.js";

const ROLE_LABEL = { pm: "Project Manager", fe: "Front End Developer", be: "Back End Developer", pd: "Product Designer" };

export default function Pool() {
  const { token, user } = useAuth();
  const { push } = useToast();
  const [jobs, setJobs] = useState([]);
  const [seats, setSeats] = useState({});
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const pool = await listJobPool(token);
      setJobs(pool.items || []);
      const mine = await myActiveJob(token);
      setActive(mine.active);
      const entries = await Promise.all((pool.items || []).map(async (j) => [j.id, await listSlots(token, j.id)]));
      const map = {};
      for (const [id, s] of entries) map[id] = s.slots || [];
      setSeats(map);
    } catch (err) {
      setError(err.message);
      push(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  async function apply(requestId) {
    setBusy(requestId);
    try {
      await applyToJob(token, requestId);
      push("Application sent. EXC will review it.");
      await load();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Job pool</h1>
      <p className="mt-1 text-sm text-zinc-500">One seat per discipline. You can hold one active job at a time.</p>
      {active && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          You are staffing <span className="font-semibold">#{active.service_request_id} {active.title}</span>.{" "}
          <Link to="/dashboard/my-work" className="font-semibold underline underline-offset-4">
            Open my work
          </Link>
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <div className="mt-6 flex flex-col gap-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}
      {!loading && jobs.length === 0 && !error && (
        <div className="mt-6">
          <EmptyState title="No open jobs" body="Accepted requests will appear here once EXC approves them." />
        </div>
      )}
      {!loading &&
        jobs.map((j) => (
          <section key={j.id} className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-zinc-900">
                  <span className="mr-2 tabular-nums text-zinc-400">#{j.id}</span>
                  {j.title}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">Opened {new Date(j.opened_at).toLocaleString()}</p>
              </div>
            </div>
            <ul className="mt-4 divide-y divide-zinc-100">
              {(seats[j.id] || []).map((s) => {
                const reason = applyBlockReason({ userRole: user?.role, seat: s, hasActiveJob: !!active, hasPending: false });
                const mine = s.role === user?.role;
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{ROLE_LABEL[s.role] || s.role}</p>
                      <p className="text-xs text-zinc-500">
                        {s.status === "FILLED" ? `Filled by ${s.occupant_name || s.occupant_email}` : "Open seat"}
                      </p>
                    </div>
                    {mine &&
                      (reason ? (
                        <span className="text-xs text-zinc-400">{blockMessage(reason)}</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy === j.id}
                          onClick={() => apply(j.id)}
                          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
                        >
                          {busy === j.id ? "Sending..." : "Apply for this seat"}
                        </button>
                      ))}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </main>
  );
}
