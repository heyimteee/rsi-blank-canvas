import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Home() {
  const { user } = useAuth();
  const role = user?.role || "member";

  const cards = [];
  if (role === "exc" || role === "admin") {
    cards.push({ to: "/dashboard/requests", title: "Review requests", body: "Accept or reject client submissions." });
  }
  if (role === "pm" || role === "admin") {
    cards.push({ to: "/dashboard/revisions", title: "Review revisions", body: "Split concerns and update milestones." });
  }
  cards.push({ to: "/dashboard/job-pool", title: "Open job pool", body: "See accepted work that needs a team." });
  cards.push({ to: "/dashboard/milestones", title: "Milestones", body: "Track progress per request." });

  return (
    <main className="mx-auto w-full max-w-4xl bg-white px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-black">Welcome, This is a Blank Canvas</h1>
      <p className="mt-1 text-sm text-zinc-500">Signed in{user?.email ? ` as ${user.email}` : ""}. Pick a board to continue.</p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:bg-zinc-50 active:scale-[0.99]"
          >
            <p className="text-base font-semibold text-zinc-900">{c.title}</p>
            <p className="mt-1 text-sm text-zinc-500">{c.body}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
