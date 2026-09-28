import { Link } from "react-router-dom";

const STEPS = [
  { n: "01", title: "Tell us what you need", body: "Fill the public request form. No account needed. You get an instant confirmation email with a tracking token." },
  { n: "02", title: "We review and staff it", body: "External Collaboration accepts the request and opens it to the team pool. Members apply and join fixed seats." },
  { n: "03", title: "Track and revise", body: "Follow progress on the tracking page. Ask for changes through the revision form at any time." },
];

export default function Landing() {
  return (
    <main className="bg-white">
      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">BCC Software House</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 md:text-5xl">
            Software built by students, tracked in the open.
          </h1>
          <p className="mt-4 max-w-[55ch] text-base leading-relaxed text-zinc-600">
            Request a project, watch it move from review to team to delivery, and ask for revisions without chasing anyone on chat.
          </p>
          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <Link
              to="/request"
              className="rounded-lg bg-zinc-900 px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98]"
            >
              Request a project
            </Link>
            <Link
              to="/track"
              className="rounded-lg border border-zinc-200 bg-white px-5 py-3 text-center text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98]"
            >
              Track an existing request
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8">
          <p className="text-sm font-semibold text-zinc-900">How tracking works</p>
          <p className="mt-1 font-mono text-xs text-zinc-500">confirmation email holds your token</p>
          <ol className="mt-4 flex flex-col divide-y divide-zinc-200">
            {["Submit the form", "Get the confirmation", "Watch review turn into a team", "Accept, revise, done"].map((s, i) => (
              <li key={s} className="flex items-center gap-3 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white tabular-nums">
                  {i + 1}
                </span>
                <span className="text-sm text-zinc-700">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="border-t border-zinc-100">
        <div className="mx-auto w-full max-w-5xl px-4 py-14">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">From request to delivery</h2>
          <div className="mt-6 flex flex-col divide-y divide-zinc-100">
            {STEPS.map((s) => (
              <div key={s.n} className="grid grid-cols-1 gap-1 py-6 sm:grid-cols-[64px_1fr] sm:gap-6">
                <span className="font-mono text-sm text-zinc-400 tabular-nums">{s.n}</span>
                <div>
                  <p className="text-base font-semibold text-zinc-900">{s.title}</p>
                  <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-zinc-600">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <Link
              to="/revision/new"
              className="rounded-lg border border-zinc-200 bg-white px-5 py-3 text-center text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98]"
            >
              Request a revision
            </Link>
            <Link
              to="/login"
              className="rounded-lg px-5 py-3 text-center text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
            >
              Team sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
