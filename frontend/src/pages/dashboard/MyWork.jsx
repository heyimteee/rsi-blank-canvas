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
  createMilestone,
  updateMilestone,
  createTask,
  updateTask,
  deleteTask,
  listSlots,
  listLeaveRequests,
  decideLeave,
  requestLeave,
  kickSeat,
  completeJob,
} from "../../lib/dashboard.js";
import { FILTER_ROLES, ROLE_LABEL, ALL_ROLES, toggleRole, filterTasks, isOverdue, todayIso } from "../../lib/team.js";

const TASK_STATUS = ["OPEN", "IN_PROGRESS", "DONE"];
const MILESTONE_STATUS = ["OPEN", "IN_PROGRESS", "DONE", "REVISED"];
const blankTask = () => ({ title: "", description: "", assignee: "", deadline: "" });

export default function MyWork() {
  const { token, user } = useAuth();
  const { push } = useToast();
  const [active, setActive] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [team, setTeam] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [roles, setRoles] = useState(ALL_ROLES);
  const [drafts, setDrafts] = useState({});
  const [newMilestone, setNewMilestone] = useState({ title: "", description: "" });
  const [leaveReason, setLeaveReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDone, setConfirmDone] = useState(false);
  const [warning, setWarning] = useState(null);
  const isPm = user?.role === "pm";
  const today = todayIso();

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

  function assignableMembers() {
    return team.filter((s) => s.status === "FILLED");
  }

  async function addMilestone() {
    if (newMilestone.title.trim().length < 3) {
      push("Milestone title needs at least 3 characters.", "error");
      return;
    }
    setBusy(true);
    try {
      const out = await createMilestone(token, active.service_request_id, {
        title: newMilestone.title.trim(),
        description: newMilestone.description.trim() || undefined,
      });
      setMilestones((prev) => [...prev, { ...out, tasks: [] }]);
      setNewMilestone({ title: "", description: "" });
      push("Milestone created.");
    } catch (err) {
      push(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function setMilestoneStatus(mid, status) {
    try {
      const out = await updateMilestone(token, mid, { status });
      setMilestones((prev) => prev.map((m) => (m.id === mid ? { ...m, ...out } : m)));
      if (out.warning) {
        setWarning({ title: out.warning, body: `${out.open_tasks} task${out.open_tasks === 1 ? "" : "s"} are still open in this milestone. They stay visible and can be finished later.` });
      } else {
        push("Milestone updated.");
      }
    } catch (err) {
      push(err.message, "error");
    }
  }

  async function addTask(mid) {
    const draft = drafts[mid] || blankTask();
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
        deadline: draft.deadline || undefined,
      });
      setMilestones((prev) =>
        prev.map((m) => (m.id === mid ? { ...m, tasks: [...(m.tasks || []), out] } : m))
      );
      setDrafts((prev) => ({ ...prev, [mid]: blankTask() }));
      push("Task assigned.");
    } catch (err) {
      push(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function replaceTask(taskId, next) {
    setMilestones((prev) =>
      prev.map((m) => ({ ...m, tasks: (m.tasks || []).map((t) => (t.id === taskId ? { ...t, ...next } : t)) }))
    );
  }

  async function moveTask(taskId, status) {
    try {
      const out = await updateTask(token, taskId, { status });
      replaceTask(taskId, out);
      push("Task updated.");
    } catch (err) {
      push(err.message, "error");
    }
  }

  async function patchTask(taskId, payload) {
    try {
      const out = await updateTask(token, taskId, payload);
      replaceTask(taskId, out);
      push("Task saved.");
    } catch (err) {
      push(err.message, "error");
    }
  }

  async function removeTask(taskId) {
    try {
      await deleteTask(token, taskId);
      setMilestones((prev) => prev.map((m) => ({ ...m, tasks: (m.tasks || []).filter((t) => t.id !== taskId) })));
      push("Task removed.");
    } catch (err) {
      push(err.message, "error");
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

  const members = assignableMembers();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        <span className="mr-2 tabular-nums text-zinc-400">#{active.service_request_id}</span>
        {active.title}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Your seat: {ROLE_LABEL[active.seat] || active.seat}. Milestones and tasks update live for the team.
      </p>
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-zinc-900">Show work from</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {FILTER_ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={roles.includes(r)}
                onChange={() => setRoles((prev) => toggleRole(prev, r))}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-200"
              />
              {ROLE_LABEL[r]}
            </label>
          ))}
        </div>
        {roles.length === 0 && (
          <p className="mt-2 text-xs text-zinc-500">Nothing selected, so no tasks are shown. Pick at least one role.</p>
        )}
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">Milestones and tasks</h2>
        </div>

        {isPm && (
          <div className="mt-3 grid grid-cols-1 gap-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto]">
            <Field label="New milestone">
              <input
                className={inputCls}
                placeholder="Phase 1, foundation"
                value={newMilestone.title}
                onChange={(e) => setNewMilestone((p) => ({ ...p, title: e.target.value }))}
              />
            </Field>
            <Field label="Description (optional)">
              <input
                className={inputCls}
                placeholder="What this phase covers"
                value={newMilestone.description}
                onChange={(e) => setNewMilestone((p) => ({ ...p, description: e.target.value }))}
              />
            </Field>
            <button
              type="button"
              disabled={busy}
              onClick={addMilestone}
              className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 sm:mt-6"
            >
              Create milestone
            </button>
          </div>
        )}

        {milestones.length === 0 && (
          <div className="mt-3">
            <EmptyState
              title="No milestones yet"
              body={isPm ? "Create the first milestone, then fill it with tasks for the team." : "Your PM sets milestones and tasks. They will appear here."}
            />
          </div>
        )}

        {milestones.map((m) => {
          const visible = filterTasks(m.tasks || [], roles);
          return (
            <div key={m.id} className="mt-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900">{m.title}</p>
                  {m.description && <p className="mt-0.5 text-xs text-zinc-500">{m.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={m.status} />
                  {isPm && (
                    <select
                      value={m.status}
                      onChange={(e) => setMilestoneStatus(m.id, e.target.value)}
                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-400"
                      aria-label={`Update milestone ${m.id}`}
                    >
                      {MILESTONE_STATUS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <ul className="mt-3 divide-y divide-zinc-100">
                {visible.map((t) => {
                  const mine = t.assignee_id === user?.id;
                  const overdue = isOverdue(t, today);
                  return (
                    <li key={t.id} className="py-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-zinc-800">{t.title}</p>
                          {t.description && <p className="mt-0.5 text-xs text-zinc-500">{t.description}</p>}
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {t.assignee_name || t.assignee_email || "Unassigned"}
                            {t.deadline && (
                              <>
                                {" · due "}
                                <span className={overdue ? "font-medium text-red-700" : "tabular-nums"}>{String(t.deadline).slice(0, 10)}</span>
                                {overdue && " (overdue)"}
                              </>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {(mine || isPm) ? (
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
                          ) : (
                            <StatusBadge status={t.status} />
                          )}
                          {isPm && (
                            <button
                              type="button"
                              onClick={() => removeTask(t.id)}
                              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98]"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                      {isPm && (
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                          <input
                            className={`${inputCls} text-xs`}
                            defaultValue={t.description || ""}
                            placeholder="Task description"
                            onBlur={(e) => {
                              if ((t.description || "") !== e.target.value) patchTask(t.id, { description: e.target.value });
                            }}
                          />
                          <select
                            className={`${inputCls} bg-white text-xs`}
                            defaultValue={t.assignee_id || ""}
                            onChange={(e) => patchTask(t.id, { assignee_id: e.target.value ? Number(e.target.value) : null })}
                            aria-label={`Reassign task ${t.id}`}
                          >
                            <option value="">Unassigned</option>
                            {members.map((s) => (
                              <option key={s.id} value={s.filled_by}>
                                {ROLE_LABEL[s.role]}: {s.occupant_name || s.occupant_email}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            className={`${inputCls} text-xs tabular-nums`}
                            defaultValue={t.deadline ? String(t.deadline).slice(0, 10) : ""}
                            min={today}
                            onChange={(e) => patchTask(t.id, { deadline: e.target.value || null })}
                            aria-label={`Deadline for task ${t.id}`}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {(m.tasks || []).length > 0 && visible.length === 0 && (
                <p className="mt-2 text-xs text-zinc-500">No tasks match the current filter in this milestone.</p>
              )}
              {(m.tasks || []).length === 0 && <p className="mt-2 text-xs text-zinc-400">No tasks yet.</p>}

              {isPm && (
                <div className="mt-3 rounded-xl bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add task</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      className={inputCls}
                      placeholder="What to do"
                      value={(drafts[m.id] || blankTask()).title}
                      onChange={(e) => setDrafts((p) => ({ ...p, [m.id]: { ...(p[m.id] || blankTask()), title: e.target.value } }))}
                    />
                    <input
                      className={inputCls}
                      placeholder="Description (optional)"
                      value={(drafts[m.id] || blankTask()).description}
                      onChange={(e) => setDrafts((p) => ({ ...p, [m.id]: { ...(p[m.id] || blankTask()), description: e.target.value } }))}
                    />
                    <select
                      className={`${inputCls} bg-white`}
                      value={(drafts[m.id] || blankTask()).assignee}
                      onChange={(e) => setDrafts((p) => ({ ...p, [m.id]: { ...(p[m.id] || blankTask()), assignee: e.target.value } }))}
                      aria-label={`Assign new task in milestone ${m.id}`}
                    >
                      <option value="">Unassigned</option>
                      {members.map((s) => (
                        <option key={s.id} value={s.filled_by}>
                          {ROLE_LABEL[s.role]}: {s.occupant_name || s.occupant_email}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      className={`${inputCls} tabular-nums`}
                      min={today}
                      value={(drafts[m.id] || blankTask()).deadline}
                      onChange={(e) => setDrafts((p) => ({ ...p, [m.id]: { ...(p[m.id] || blankTask()), deadline: e.target.value } }))}
                      aria-label={`Deadline for new task in milestone ${m.id}`}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => addTask(m.id)}
                    className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
                  >
                    Assign task
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {isPm && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-zinc-900">Team</h2>
          <ul className="mt-3 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white shadow-sm">
            {team.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{ROLE_LABEL[s.role] || s.role}</p>
                  <p className="text-xs text-zinc-500">{s.status === "FILLED" ? s.occupant_name || s.occupant_email : "Open seat"}</p>
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
      {warning && (
        <Confirm
          title={warning.title}
          body={warning.body}
          confirmLabel="Understood"
          onCancel={() => setWarning(null)}
          onConfirm={() => setWarning(null)}
        />
      )}
    </main>
  );
}
