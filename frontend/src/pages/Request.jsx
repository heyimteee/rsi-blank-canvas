import { useState } from "react";
import { Link } from "react-router-dom";
import Field, { inputCls } from "../components/Field.jsx";
import { useToast } from "../components/Toast.jsx";
import { validateIntake } from "../lib/validation.js";
import { submitRequest } from "../lib/requests.js";

const initial = { client_name: "", client_email: "", client_org: "", title: "", details: "", budget_range: "", timeline: "" };

export default function Request() {
  const { push } = useToast();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const msg = validateIntake(form);
    if (msg) {
      setError(msg);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const out = await submitRequest({
        client_name: form.client_name.trim(),
        client_email: form.client_email.trim(),
        client_org: form.client_org.trim() || undefined,
        title: form.title.trim(),
        details: form.details.trim(),
        budget_range: form.budget_range.trim() || undefined,
        timeline: form.timeline.trim() || undefined,
      });
      setDone(out);
      push("Request sent. Check your email for confirmation.");
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
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Request received</h1>
          <p className="mt-1 text-sm text-zinc-500">We sent a confirmation to your email. Save your tracking token.</p>
          <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900">{done.tracking_token}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link
              to={`/track/${done.tracking_token}`}
              className="rounded-lg bg-zinc-900 px-4 py-2.5 text-center text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98]"
            >
              Track status
            </Link>
            <button
              type="button"
              onClick={() => {
                setDone(null);
                setForm(initial);
              }}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98]"
            >
              Send another request
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Request a service</h1>
      <p className="mt-1 text-sm text-zinc-500">Tell us what you need. No account needed. We reply by email.</p>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        <Field label="Your name" helper="Person we can contact about this request.">
          <input className={inputCls} value={form.client_name} onChange={(e) => set("client_name", e.target.value)} placeholder="Your full name" autoComplete="name" />
        </Field>
        <Field label="Email" helper="Confirmation and decision arrive here.">
          <input className={inputCls} type="email" value={form.client_email} onChange={(e) => set("client_email", e.target.value)} placeholder="you@example.com" autoComplete="email" />
        </Field>
        <Field label="Organization (optional)">
          <input className={inputCls} value={form.client_org} onChange={(e) => set("client_org", e.target.value)} placeholder="Company or community" />
        </Field>
        <Field label="Project title">
          <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Company profile website" />
        </Field>
        <Field label="Project details" helper="Goals, pages, and must have features.">
          <textarea className={`${inputCls} min-h-28`} value={form.details} onChange={(e) => set("details", e.target.value)} placeholder="Describe what you need and why" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Budget range (optional)">
            <input className={inputCls} value={form.budget_range} onChange={(e) => set("budget_range", e.target.value)} placeholder="e.g. under 5jt" />
          </Field>
          <Field label="Timeline (optional)">
            <input className={inputCls} value={form.timeline} onChange={(e) => set("timeline", e.target.value)} placeholder="e.g. 4 weeks" />
          </Field>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send request"}
        </button>
      </form>
    </main>
  );
}
