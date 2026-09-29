import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import Field, { inputCls } from "../../components/Field.jsx";
import { getRevision, decideRevision } from "../../lib/dashboard.js";

const DEFAULT_REASON = "Not within current project scope.";

function formatAmount(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "Not set";
  const n = Number(amount);
  const locale = currency === "USD" ? "en-US" : "id-ID";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency || "IDR", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency || ""} ${n.toLocaleString(locale)}`.trim();
  }
}

export default function RevisionDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setData(await getRevision(token, id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token, id]);

  async function decide() {
    const decision = pending;
    setBusy(true);
    setError("");
    try {
      const out = await decideRevision(token, id, {
        decision,
        reason: decision === "reject" ? reason.trim() || undefined : undefined,
      });
      setData((d) => ({ ...d, status: out.status, decision_notes: out.reason }));
      push(decision === "accept" ? "Revision accepted. Client notified." : "Revision rejected. Client notified.");
      setPending(null);
    } catch (err) {
      setError(err.message);
      push(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <Skeleton className="h-40" />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error || "Revision not found."}
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard/revisions")}
          className="mt-4 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Back to list
        </button>
      </main>
    );
  }

  const decided = data.status === "REJECTED" || data.status === "ACCEPTED_NOTIFIED";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <button
        type="button"
        onClick={() => navigate("/dashboard/revisions")}
        className="text-sm text-zinc-500 transition hover:text-zinc-900"
      >
        Back to revisions
      </button>
      <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Revision <span className="tabular-nums">#{data.id}</span> for request <span className="tabular-nums">#{data.service_request_id}</span>
          </h1>
          <StatusBadge status={data.status} />
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What the client wants changed</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-700">{data.general_details}</p>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Expected delivery</dt>
            <dd className="mt-1 text-sm text-zinc-900 tabular-nums">{data.delivery_date || "Not set"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">New total budget</dt>
            <dd className="mt-1 text-sm text-zinc-900 tabular-nums">{formatAmount(data.new_budget_amount, data.budget_currency)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Added cost</dt>
            <dd className="mt-1 text-sm text-zinc-900 tabular-nums">{formatAmount(data.added_cost_amount, data.budget_currency)}</dd>
          </div>
        </dl>

        {decided && (
          <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recorded reason</p>
            <p className="mt-1 text-sm text-zinc-700">{data.decision_notes || "No reason recorded."}</p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {!decided && (
          <div className="mt-6 flex flex-col gap-4">
            <Field label="Reason for rejection (optional)" helper={`Leave this empty and the client sees: ${DEFAULT_REASON}`}>
              <textarea
                className={`${inputCls} min-h-20`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain briefly why this revision cannot be taken"
              />
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending("accept")}
                className="flex-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
              >
                Accept revision
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending("reject")}
                className="flex-1 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 active:scale-[0.98] disabled:opacity-50"
              >
                Reject revision
              </button>
            </div>
          </div>
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-base font-semibold text-zinc-900">
              {pending === "accept" ? `Accept revision #${data.id}?` : `Reject revision #${data.id}?`}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {pending === "accept"
                ? "The client gets an acceptance email. Plan the work afterwards on My Work."
                : `The client gets a rejection email${reason.trim() ? ` with your reason` : ` with the default reason`}. This cannot be undone.`}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={busy}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={decide}
                disabled={busy}
                className={
                  pending === "accept"
                    ? "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
                    : "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 active:scale-[0.98] disabled:opacity-50"
                }
              >
                {busy ? "Working..." : pending === "accept" ? "Accept revision" : "Reject revision"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
