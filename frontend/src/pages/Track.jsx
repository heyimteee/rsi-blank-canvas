import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Field, { inputCls } from "../components/Field.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { useToast } from "../components/Toast.jsx";
import { trackRequest } from "../lib/requests.js";

const STEPS = ["Submitted", "Confirmation sent", "Under review", "Decided"];

export default function Track() {
  const { token } = useParams();
  const { push } = useToast();
  const [value, setValue] = useState(token || "");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(t) {
    const key = (t || "").trim();
    if (!key) {
      setError("Enter your tracking token.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const out = await trackRequest(key);
      setData(out);
    } catch (err) {
      setData(null);
      setError(err.message);
      push(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) load(token);
  }, [token]);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Track your request</h1>
      <p className="mt-1 text-sm text-zinc-500">Paste the token from your confirmation email.</p>
      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          load(value);
        }}
      >
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
      {!loading && !data && !error && (
        <div className="mt-6">
          <EmptyState title="No request loaded yet" body="Enter a token above to see the current status and decision." />
        </div>
      )}
      {data && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-zinc-900">{data.title}</p>
              <p className="mt-1 font-mono text-xs text-zinc-500">{data.tracking_token}</p>
            </div>
            <StatusBadge status={data.status} />
          </div>
          <ol className="mt-6 flex flex-col gap-0 divide-y divide-zinc-100">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 py-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white tabular-nums">
                  {i + 1}
                </span>
                <span className="text-sm text-zinc-700">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </main>
  );
}
