import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import Confirm from "../../components/Confirm.jsx";
import Field, { inputCls } from "../../components/Field.jsx";
import {
  myActiveJob,
  listMilestones,
  listTasks,
  createTask,
  updateTask,
  listSlots,
  listLeaveRequests,
  decideLeave,
  requestLeave,
  kickSeat,
  completeJob,
} from "../../lib/dashboard.js";

const TASK_STATUS = ["OPEN", "IN_PROGRESS", "DONE"];

export default function MyWork() {
  const { token, user } = useAuth();
  const { push } = useToast();
  const [active, setActive] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [tasks, setTasks] = useState({});
  const [team, setTeam] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  const [leaveReason, setLeaveReason] = useState("");
  const [newTask, setNewTask] = useState({});
  const isPm = user?.role === "pm";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const mine = await myActiveJob(token);
      setActive(mine.active);
      if (mine.active) {
        const reqId = mine.active.service_request_id;
        const ms = await listMilestones(token, reqId);
        setMilestones(ms.items || []);
        const pairs = await Promise.all((ms.items || []).map(async (m) => [m.id, await listTasks(token, m.id)]));
        const tmap = {};
        for (const [mid, t] of pairs) tmap[mid] = t.items || [];
        setTasks(tmap);
        const sl = await listSlots(token, reqId);
        setTeam(sl.slots || []);
        if (isPm) {
          const lq = await listLeaveRequests(token, reqId);
          setLeaves((lq.items || []).filter((x) => x.status === "PENDING"));
        }
      }
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

  async function moveTask(taskId, status) {
    try {
      const out = await updateTask(token, taskId, { status });
      setTasks((prev) => {
        const next = {};
        for (const k of Object.keys(prev)) next[k] = prev[k].map((t) => (t.id === taskId ? out : t));
        return next;
      });
      push("Task updated.");
    } catch (err) {
      push(err.message, "error");
    }
  }

  async function addTask(mid) {
    const draft = newTask[mid] || {};
    if (!draft.title || draft.title.trim().length < 3) {
      push("Task title needs at least 3 characters.", "error");
      return;
    }
    setBusy(true);
    try {
      const out = await createTask(token, mid, {
        title: draft.title.trim(),
        description: draft.description?.trim() || undefined,
        assignee_id: draft.assignee ? Number(draft.assignee) : undefined,
      });
      setTasks((prev) => ({ ...prev, [mid]: [...(prev[mid] || []), out] }));
      setNewTask((prev) => ({ ...prev, [mid]: {} }));
      push("Task assigned.");
    } catch (err) {
      push(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function decide(leaveId, decision) {
    try {
      await decideLeave(token, leaveId, decision);
      setLeaves((prev) => prev.filter((x) => x.id !== leaveId));
      push(decision === "accept" ? "Leave approved. Seat reopened." : "Leave rejected.");
      await load();
    } catch (err) {
      push(err.message, "error");
    }
  }

  async function kick(slotId) {
    try {
      await kickSeat(token, slotId);
      push("Member removed. Seat reopened.");
      await load();
    } catch (err) {
      push(err.message, "error");
    }
  }

  async function leave() {
    try {
      await requestLeave(token, active.service_request_id, leaveReason.trim() || undefined);
      setLeaveReason("");
      push("Leave request sent to your PM.");
    } catch (err) {
      push(err.message, "error");
    }
  }

  async function complete() {
    setBusy(true);
    try {
      await completeJob(token, active.service_request_id);
      setConfirmDone(false);
      push("Job completed. Everyone is free for new work.");
      await load();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <Skeleton className="h-32" />
      </main>
    );
  }

  if (!active) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">My work</h1>
        <div className="mt-6">
          <EmptyState
            title="No active job"
            body={error || "Apply for a seat in the job pool. Your milestones and tasks will appear here."}
          />
        </div>
        <Link
          to="/dashboard/pool"
          className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98]"
        >
          Open job pool
        </Link>
      </main>
    );
  }

  const occupants = team.filter((s) => s.status === "FILLED");
  const names = {};
  for (const s of occupants) names[s.filled_by] = s.occupant_name || s.occupant_email;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        <span className="mr-2 tabular-nums text-zinc-400">#{active.service_request_id}</span>
        {active.title}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">Your seat: {active.seat}. Milestones and tasks update live for the team.</p>
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      <section className="mt-6">
        <h2 className="text-base font-semibold text-zinc-900">Milestones and tasks</h2>
        {milestones.length === 0 && (
          <div className="mt-3">
            <EmptyState title="No milestones yet" body="Your PM adds milestones after accepting a revision." />
          </div>
        )}
        {milestones.map((m) => (
          <div key={m.id} className="mt-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-900">{m.title}</p>
              <StatusBadge status={m.status} />
            </div>
            <ul className="mt-3 divide-y divide-zinc-100">
              {(tasks[m.id] || []).map((t) => {
                const mine = t.assignee_id === user?.id;
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-800">{t.title}</p>
                      <p className="text-xs text-zinc-500">{(t.assignee_id && names[t.assignee_id]) || "Unassigned"}</p>
                    </div>
                    {(mine || isPm) && (
                      <select
                        value={t.status}
                        onChange={(e) => moveTask(t.id, e.target.value)}
                        className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-400"
                        aria-label={`Move task ${t.id}`}
                      >
                        {TASK_STATUS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    )}
                    {!mine && !isPm && <StatusBadge status={t.status} />}
                  </li>
                );
              })}
            </ul>
            {(tasks[m.id] || []).length === 0 && <p className="mt-2 text-xs text-zinc-400">No tasks yet.</p>}
            {isPm && (
              <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-zinc-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  className={inputCls}
                  placeholder="New task title"
                  value={(newTask[m.id] || {}).title || ""}
                  onChange={(e) => setNewTask((p) => ({ ...p, [m.id]: { ...(p[m.id] || {}), title: e.target.value } }))}
                />
                <select
                  className={`${inputCls} bg-white`}
                  value={(newTask[m.id] || {}).assignee || ""}
                  onChange={(e) => setNewTask((p) => ({ ...p, [m.id]: { ...(p[m.id] || {}), assignee: e.target.value } }))}
                  aria-label="Assign to"
                >
                  <option value="">Unassigned</option>
                  {occupants.map((s) => (
                    <option key={s.id} value={s.filled_by}>
                      {s.role}: {s.occupant_name || s.occupant_email}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => addTask(m.id)}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
                >
                  Assign
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
      {isPm && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-zinc-900">Team</h2>
          <ul className="mt-3 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white shadow-sm">
            {team.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{s.role}</p>
                  <p className="text-xs text-zinc-500">{s.status === "FILLED" ? s.occupant_name || s.occupant_email : "Open"}</p>
                </div>
                {s.status === "FILLED" && s.filled_by !== user?.id && (
                  <button
                    type="button"
                    onClick={() => kick(s.id)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 active:scale-[0.98]"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {leaves.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-zinc-900">Leave requests</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {leaves.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3">
                    <p className="text-sm text-zinc-700">
                      {l.email}
                      {l.reason ? ` wants to leave: ${l.reason}` : " wants to leave."}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => decide(l.id, "accept")}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98]"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(l.id, "reject")}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98]"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={() => setConfirmDone(true)}
            className="mt-4 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98]"
          >
            Complete job
          </button>
        </section>
      )}
      {!isPm && (
        <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Need to leave this job?</h2>
          <p className="mt-1 text-xs text-zinc-500">Your PM reviews the request.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className={`${inputCls} flex-1`}
              placeholder="Reason (optional)"
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
            />
            <button
              type="button"
              onClick={leave}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98]"
            >
              Request to leave
            </button>
          </div>
        </section>
      )}
      {confirmDone && (
        <Confirm
          title="Complete this job?"
          body="The pool closes and everyone becomes free for new work. This cannot be undone."
          confirmLabel="Complete job"
          busy={busy}
          onCancel={() => setConfirmDone(false)}
          onConfirm={complete}
        />
      )}
    </main>
  );
}
