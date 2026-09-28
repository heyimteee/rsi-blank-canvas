import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import {
  getRequestFull,
  listApplications,
  decideApplication,
  deleteRequest,
} from "../../lib/dashboard.js";

export default function JobDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [full, setFull] = useState(null);
  const [apps, setApps] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");

  async function load() {
    setLoading(true);
    try {
      setFull(await getRequestFull(token, id));
      const aq = await listApplications(token, id);
      setApps((aq.items || []).filter((a) => a.status === "PENDING"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token, id]);

  async function decide(appId, decision) {
    try {
      await decideApplication(token, appId, decision);
      push(decision === "approve" ? "Seat filled." : "Application rejected.");
      await load();
    } catch (err) {
      push(err.message, "error");
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteRequest(token, id);
      push("Project deleted with all its records.");
      navigate("/dashboard/jobs");
    } catch (err) {
      push(err.message, "error");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <Skeleton className="h-40" />
      </main>
    );
  }

  if (!full) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error || "Job not found."}
        </div>
      </main>
    );
  }

  const { request, slots, milestones, tasks, revisions } = full;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <button
        type="button"
        onClick={() => navigate("/dashboard/jobs")}
        className="text-sm text-zinc-500 transition hover:text-zinc-900"
      >
        Back to jobs
      </button>
      <div className="mt-3 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          <span className="mr-2 tabular-nums text-zinc-400">#{request.id}</span>
          {request.title}
        </h1>
        <StatusBadge status={request.status} />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Team seats</h2>
          <ul className="mt-2 divide-y divide-zinc-100">
            {slots.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{s.role}</p>
                  <p className="text-xs text-zinc-500">{s.status === "FILLED" ? s.occupant_name || s.occupant_email : "Open"}</p>
                </div>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Pending applications</h2>
          {apps.length === 0 && <p className="mt-2 text-sm text-zinc-500">No one waiting for review.</p>}
          <ul className="mt-2 flex flex-col gap-2">
            {apps.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2">
                <p className="text-sm text-zinc-700">
                  {a.email} <span className="text-xs text-zinc-400">· {a.role}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => decide(a.id, "approve")}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98]"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(a.id, "reject")}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98]"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Milestones and tasks</h2>
          {milestones.length === 0 && <p className="mt-2 text-sm text-zinc-500">No milestones yet.</p>}
          {milestones.map((m) => (
            <div key={m.id} className="mt-3 border-t border-zinc-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-900">{m.title}</p>
                <StatusBadge status={m.status} />
              </div>
              <ul className="mt-1">
                {tasks
                  .filter((t) => t.milestone_id === m.id)
                  .map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 py-1 text-sm text-zinc-600">
                      <span className="truncate">{t.title}</span>
                      <StatusBadge status={t.status} />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Revisions</h2>
          {revisions.length === 0 && <p className="mt-2 text-sm text-zinc-500">No revisions yet.</p>}
          <ul className="mt-2 flex flex-col gap-2">
            {revisions.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2">
                <p className="text-sm text-zinc-700">
                  Revision <span className="tabular-nums">#{r.id}</span>
                </p>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <h3 className="text-sm font-semibold text-red-700">Danger zone</h3>
            <p className="mt-1 text-xs text-zinc-500">Deletes the project with seats, revisions, milestones, and tasks.</p>
            <button
              type="button"
              onClick={() => {
                setDeleteWord("");
                setConfirmDelete(true);
              }}
              className="mt-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 active:scale-[0.98]"
            >
              Delete entire project
            </button>
          </div>
        </section>
      </div>
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-base font-semibold text-zinc-900">Delete project #{request.id}?</p>
            <p className="mt-1 text-sm text-zinc-500">Type the project number below to confirm. Everything tied to it is removed.</p>
            <label className="mt-4 block text-sm font-medium text-zinc-700">
              Project number
              <input
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums outline-none focus:border-zinc-400"
                value={deleteWord}
                onChange={(e) => setDeleteWord(e.target.value)}
                placeholder={String(request.id)}
                inputMode="numeric"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy || deleteWord.trim() !== String(request.id)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? "Deleting..." : "Delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
