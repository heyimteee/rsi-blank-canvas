export function navLinks({ isAuthenticated, role }) {
  if (!isAuthenticated) {
    return [
      { to: "/", label: "Home" },
      { to: "/request", label: "Request" },
      { to: "/track", label: "Track" },
      { to: "/revision/new", label: "Revise" },
    ];
  }
  if (role === "exc") {
    return [
      { to: "/", label: "Home" },
      { to: "/dashboard/requests", label: "Requests" },
      { to: "/dashboard/jobs", label: "Jobs" },
      { to: "/dashboard/overview", label: "Tracking" },
    ];
  }
  const links = [
    { to: "/", label: "Home" },
    { to: "/dashboard/pool", label: "Job pool" },
    { to: "/dashboard/my-work", label: "My work" },
  ];
  if (role === "pm") {
    links.push({ to: "/dashboard/revisions", label: "Revisions" });
  }
  return links;
}

const PUBLIC_ONLY = ["/request", "/revision/new"];

export function isPublicOnly(path) {
  return PUBLIC_ONLY.includes(path);
}

export function homePath({ isAuthenticated, role }) {
  if (!isAuthenticated) return "/";
  if (role === "exc") return "/dashboard/requests";
  if (role === "pm" || role === "fe" || role === "be" || role === "pd" || role === "member") {
    return role === "pm" ? "/dashboard/my-work" : "/dashboard/pool";
  }
  return "/";
}
