import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import Confirm from "../../components/Confirm.jsx";
import Field, { inputCls } from "../../components/Field.jsx";
import { getRevision, decideRevision } from "../../lib/dashboard.js";
import { splitConcerns, validateMilestones } from "../../lib/review.js";

export default function RevisionDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [concernsText, setConcernsText] = useState("");
  const [milestones, setMilestones] = useState([{ title: "", description: "" }]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  useEffect(() => {
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
    load();
  }, [token, id]);

  function setMilestone(i, key, value) {
    setMilestones((prev) => prev.map((m, idx) => (idx === i ? { ...m, [key]: value } : m)));
  }

  async function accept() {
    const concerns = splitConcerns(concernsText);
    if (concerns.length === 0) {
      setError("Split the revision into at least one concern, one per line.");
      return;
    }
    const clean = milestones.map((m) => ({ title: m.title.trim(), description: m.description.trim() || undefined }));
    const msg = validateMilestones(clean);
    if (msg) {
      setError(msg);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const out = await decideRevision(token, id, { decision: "accept", separated_concerns: concerns, milestones: clean });
      setData((d) => ({ ...d, status: out.status }));
      push("Revision accepted. Milestones updated and team notified.");
    } catch (err) {
      setError(err.message);
      push(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError("");
    try {
      const out = await decideRevision(token, id, { decision: "reject" });
      setData((d) => ({ ...d, status: out.status }));
      push("Revision rejected. Client notified.");
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
        <p className="mt-4 text-sm leading-relaxed text-zinc-700">{data.general_details}</p>
        <p className="mt-2 text-sm text-zinc-500">Terms: {data.terms}</p>
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        {!decided && (
          <div className="mt-6 flex flex-col gap-4">
            <Field label="Separated concerns" helper="One concern per line. Each becomes a work item.">
              <textarea
                className={`${inputCls} min-h-24`}
                value={concernsText}
                onChange={(e) => setConcernsText(e.target.value)}
                placeholder={"Copy changes\nPricing table update"}
              />
            </Field>
            <div>
              <p className="text-sm font-medium text-zinc-700">Milestones</p>
              <div className="mt-2 flex flex-col gap-2">
                {milestones.map((m, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-zinc-200 p-3">
                    <input
                      className={inputCls}
                      value={m.title}
                      onChange={(e) => setMilestone(i, "title", e.target.value)}
                      placeholder={`Milestone ${i + 1} title`}
                    />
                    <input
                      className={inputCls}
                      value={m.description}
                      onChange={(e) => setMilestone(i, "description", e.target.value)}
                      placeholder="Short description (optional)"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setMilestones((prev) => [...prev, { title: "", description: "" }])}
                className="mt-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98]"
              >
                Add milestone
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busy}
                onClick={accept}
                className="flex-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? "Working..." : "Accept and update milestones"}
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
          title={`Reject revision #${data.id}?`}
          body="The client gets a rejection email. This cannot be undone."
          confirmLabel="Reject revision"
          tone="danger"
          busy={busy}
          onCancel={() => setConfirmReject(false)}
          onConfirm={reject}
        />
      )}
    </main>
  );
}
