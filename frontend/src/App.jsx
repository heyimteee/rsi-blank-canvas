import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { useToast } from "./components/Toast.jsx";
import Navbar from "./components/Navbar.jsx";
import Home from "./pages/Home.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Request from "./pages/Request.jsx";
import Track from "./pages/Track.jsx";
import RevisionNew from "./pages/RevisionNew.jsx";
import Requests from "./pages/dashboard/Requests.jsx";
import RequestDetail from "./pages/dashboard/RequestDetail.jsx";
import Revisions from "./pages/dashboard/Revisions.jsx";
import RevisionDetail from "./pages/dashboard/RevisionDetail.jsx";
import Pool from "./pages/dashboard/Pool.jsx";
import MyWork from "./pages/dashboard/MyWork.jsx";
import Jobs from "./pages/dashboard/Jobs.jsx";
import JobDetail from "./pages/dashboard/JobDetail.jsx";
import Overview from "./pages/dashboard/Overview.jsx";

function Root() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-white">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }
  if (isAuthenticated) return <Home />;
  return <Landing />;
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-white">
        <p className="text-sm text-zinc-500">Checking authentication...</p>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function ClientOnlyRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const { push } = useToast();
  useEffect(() => {
    if (!loading && isAuthenticated) {
      push("Team members use the boards. These pages are for clients.");
    }
  }, [loading, isAuthenticated, push]);
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-white">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to="/" replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const { user, loading, isAuthenticated } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-white">
        <p className="text-sm text-zinc-500">Checking authentication...</p>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!roles.includes(user?.role)) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-base font-semibold text-zinc-900">Not allowed for your role</p>
          <p className="mt-1 text-sm text-zinc-500">Ask EXC to update your role if you need access.</p>
        </div>
      </main>
    );
  }
  return children;
}

function PublicOnlyRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-white">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Root />} />
        <Route
          path="/request"
          element={
            <ClientOnlyRoute>
              <Request />
            </ClientOnlyRoute>
          }
        />
        <Route path="/track" element={<Track />} />
        <Route path="/track/:token" element={<Track />} />
        <Route
          path="/revision/new"
          element={
            <ClientOnlyRoute>
              <RevisionNew />
            </ClientOnlyRoute>
          }
        />
        <Route
          path="/dashboard/requests"
          element={
            <RequireRole roles={["exc", "admin"]}>
              <Requests />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/requests/:id"
          element={
            <RequireRole roles={["exc", "admin"]}>
              <RequestDetail />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/revisions"
          element={
            <RequireRole roles={["pm", "admin"]}>
              <Revisions />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/revisions/:id"
          element={
            <RequireRole roles={["pm", "admin"]}>
              <RevisionDetail />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/pool"
          element={
            <ProtectedRoute>
              <Pool />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/my-work"
          element={
            <ProtectedRoute>
              <MyWork />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/jobs"
          element={
            <RequireRole roles={["exc", "admin"]}>
              <Jobs />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/jobs/:id"
          element={
            <RequireRole roles={["exc", "admin"]}>
              <JobDetail />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/overview"
          element={
            <RequireRole roles={["exc", "admin"]}>
              <Overview />
            </RequireRole>
          }
        />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <Register />
            </PublicOnlyRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
