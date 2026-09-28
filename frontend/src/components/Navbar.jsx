import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Navbar() {
  const { isAuthenticated, logout, user } = useAuth();
  const role = user?.role;

  return (
    <nav className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold tracking-tight text-white">
          RSI
        </div>
        <Link to="/" className="text-sm font-semibold tracking-tight text-zinc-900">
          Blank Canvas
        </Link>
        <div className="ml-4 hidden items-center gap-3 text-sm md:flex">
          <Link to="/request" className="text-zinc-500 transition hover:text-zinc-900">
            Request
          </Link>
          <Link to="/track" className="text-zinc-500 transition hover:text-zinc-900">
            Track
          </Link>
          <Link to="/revision/new" className="text-zinc-500 transition hover:text-zinc-900">
            Revise
          </Link>
          {isAuthenticated && (role === "exc" || role === "admin") && (
            <Link to="/dashboard/requests" className="text-zinc-500 transition hover:text-zinc-900">
              Requests
            </Link>
          )}
          {isAuthenticated && (role === "pm" || role === "admin") && (
            <Link to="/dashboard/revisions" className="text-zinc-500 transition hover:text-zinc-900">
              Revisions
            </Link>
          )}
          {isAuthenticated && (
            <Link to="/dashboard/job-pool" className="text-zinc-500 transition hover:text-zinc-900">
              Jobs
            </Link>
          )}
        </div>
        {isAuthenticated && user?.email && (
          <span className="ml-2 hidden text-xs text-zinc-500 lg:inline">· {user.email}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {!isAuthenticated && (
          <Link
            to="/request"
            className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98]"
          >
            New request
          </Link>
        )}
        {isAuthenticated ? (
          <button
            onClick={logout}
            className="rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 active:bg-zinc-100"
            aria-label="Logout"
          >
            Logout
          </button>
        ) : (
          <Link to="/login" className="text-sm text-zinc-500 transition hover:text-zinc-900">
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
