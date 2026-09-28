import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Field, { inputCls } from "../components/Field.jsx";
import { useToast } from "../components/Toast.jsx";
import { validateRevision, isValidEmail } from "../lib/validation.js";
import { submitRevision, trackRequest } from "../lib/requests.js";

export default function RevisionNew() {
  const [params] = useSearchParams();
  const { push } = useToast();
  const [token, setToken] = useState(params.get("token") || "");
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    if (!token.trim()) {
      setError("Paste your tracking token from the confirmation email.");
      return;
    }
    if (!isValidEmail(email.trim().toLowerCase())) {
      setError("Enter a valid email address.");
      return;
    }
    const msg = validateRevision({ general_details: details, terms });
    if (msg) {
      setError(msg);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const found = await trackRequest(token.trim());
      const out = await submitRevision({
        service_request_id: found.id,
        client_email: email.trim(),
        general_details: details.trim(),
        terms: terms.trim(),
      });
      setDone(out);
      push("Revision sent. The project manager will review it.");
    } catch (err) {
      setError(err.message);
      push(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Revision received</h1>
          <p className="mt-1 text-sm text-zinc-500">Revision ID {done.id}. We will email you once it is accepted or rejected.</p>
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setDetails("");
              setTerms("");
            }}
            className="mt-6 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98]"
          >
            Send another revision
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Request a revision</h1>
      <p className="mt-1 text-sm text-zinc-500">Describe what should change and the terms. No account needed.</p>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tracking token" helper="From your request confirmation email.">
            <input className={`${inputCls} font-mono`} value={token} onChange={(e) => setToken(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </Field>
        </div>
        <Field label="What should change" helper="Be specific about pages and content.">
          <textarea className={`${inputCls} min-h-28`} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Change hero copy and pricing table" />
        </Field>
        <Field label="Terms" helper="Scope, timing, or budget notes.">
          <textarea className={inputCls} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Within original scope, delivery in 5 days" />
        </Field>
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send revision"}
        </button>
      </form>
    </main>
  );
}
