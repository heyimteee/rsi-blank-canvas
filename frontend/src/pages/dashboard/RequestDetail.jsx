import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import Confirm from "../../components/Confirm.jsx";
import Field, { inputCls } from "../../components/Field.jsx";
import { getRequest, decideRequest } from "../../lib/dashboard.js";

export default function RequestDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        setData(await getRequest(token, id));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, id]);

  async function decide(decision) {
    setBusy(true);
    setError("");
    try {
      const out = await decideRequest(token, id, decision, notes.trim() || undefined);
      setData((d) => ({ ...d, status: out.status }));
      push(decision === "accept" ? "Request accepted. Job pool opened." : "Request rejected. Client notified.");
      setConfirmReject(false);
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
          {error || "Request not found."}
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard/requests")}
          className="mt-4 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Back to list
        </button>
      </main>
    );
  }

  const decided = data.status === "ACCEPTED" || data.status === "REJECTED" || data.status === "JOB_POOL_OPEN";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <button
        type="button"
        onClick={() => navigate("/dashboard/requests")}
        className="text-sm text-zinc-500 transition hover:text-zinc-900"
      >
        Back to requests
      </button>
      <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{data.title}</h1>
          <StatusBadge status={data.status} />
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Client</dt>
            <dd className="font-medium text-zinc-900">{data.client_name}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Email</dt>
            <dd className="font-medium text-zinc-900">{data.client_email}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-zinc-700">{data.details}</p>
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        {!decided && (
          <div className="mt-6 flex flex-col gap-4">
            <Field label="Decision note (optional)" helper="Shown in the internal record only.">
              <textarea className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why accept or reject" />
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busy}
                onClick={() => decide("accept")}
                className="flex-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? "Working..." : "Accept and open job pool"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmReject(true)}
                className="flex-1 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 active:scale-[0.98] disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        )}
        {decided && <p className="mt-6 text-sm text-zinc-500">Decision recorded. No further action needed.</p>}
      </div>
      {confirmReject && (
        <Confirm
          title={`Reject request #${data.id}?`}
          body="The client gets a rejection email. This cannot be undone."
          confirmLabel="Reject request"
          tone="danger"
          busy={busy}
          onCancel={() => setConfirmReject(false)}
          onConfirm={() => decide("reject")}
        />
      )}
    </main>
  );
}
