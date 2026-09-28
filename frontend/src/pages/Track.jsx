import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Field, { inputCls } from "../components/Field.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { useToast } from "../components/Toast.jsx";
import { trackRequest, trackRevisions } from "../lib/requests.js";
import { TRACK_STEPS, requestPhase } from "../lib/phases.js";

function Stepper({ status }) {
  const phase = requestPhase(status);
  return (
    <ol className="mt-6 flex flex-col">
      {TRACK_STEPS.map((s, i) => {
        const done = i < phase.active || (phase.terminal && i <= phase.active);
        const active = i === phase.active && !phase.terminal;
        return (
          <li key={s} className="flex items-center gap-3 py-2.5">
            <span
              className={
                done
                  ? phase.terminal === "failed" && i === phase.active
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white tabular-nums"
                    : "flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-xs font-semibold text-white tabular-nums"
                  : active
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white tabular-nums ring-4 ring-zinc-200"
                    : "flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-400 tabular-nums"
              }
            >
              {i + 1}
            </span>
            <span className={done || active ? "text-sm font-medium text-zinc-900" : "text-sm text-zinc-400"}>{s}</span>
            {active && (
              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white">
                current
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function Track() {
  const { token } = useParams();
  const { push } = useToast();
  const [tab, setTab] = useState("request");
  const [value, setValue] = useState(token || "");
  const [data, setData] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadRequest(t) {
    const key = (t || "").trim();
    if (!key) {
      setError("Enter your tracking token.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      setData(await trackRequest(key));
    } catch (err) {
      setData(null);
      setError(err.message);
      push(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadRevisions(t) {
    const key = (t || "").trim();
    if (!key) {
      setError("Enter your tracking token.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const out = await trackRevisions(key);
      setRevisions(out.items || []);
    } catch (err) {
      setRevisions([]);
      setError(err.message);
      push(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      setValue(token);
      loadRequest(token);
    }
  }, [token]);

  function submit(e) {
    e.preventDefault();
    if (tab === "request") loadRequest(value);
    else loadRevisions(value);
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Track your project</h1>
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1" role="tablist">
        {[
          { id: "request", label: "Request" },
          { id: "revision", label: "Revision" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setError("");
            }}
            className={
              tab === t.id
                ? "rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition"
                : "rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-zinc-500">
        {tab === "request"
          ? "Follow your project request from submission to team assignment."
          : "See every revision on your project and whether it was accepted."}
      </p>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={submit}>
        <div className="flex-1">
          <Field label="Tracking token">
            <input className={`${inputCls} font-mono`} value={value} onChange={(e) => setValue(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </Field>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 sm:mt-6"
        >
          {loading ? "Checking..." : "Check"}
        </button>
      </form>
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <div className="mt-6 flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-10" />
        </div>
      )}
      {!loading && tab === "request" && !data && !error && (
        <div className="mt-6">
          <EmptyState title="No request loaded yet" body="Enter a token above to see the current step and the decision." />
        </div>
      )}
      {!loading && tab === "request" && data && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-zinc-900">{data.title}</p>
              <p className="mt-1 font-mono text-xs text-zinc-500">{data.tracking_token}</p>
            </div>
            <StatusBadge status={data.status} />
          </div>
          <Stepper status={data.status} />
        </div>
      )}
      {!loading && tab === "revision" && revisions.length === 0 && !error && (
        <div className="mt-6">
          <EmptyState title="No revisions checked yet" body="Enter the request token above to list its revisions." />
        </div>
      )}
      {!loading && tab === "revision" && revisions.length > 0 && (
        <ul className="mt-6 flex flex-col gap-2">
          {revisions.map((r) => (
            <li key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-900">
                  Revision <span className="tabular-nums">#{r.id}</span>
                </p>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{r.general_details}</p>
              <p className="mt-2 text-xs text-zinc-400 tabular-nums">{new Date(r.created_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
