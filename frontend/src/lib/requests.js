import { apiFetch } from "./api.js";

export function submitRequest(body) {
  return apiFetch("/api/requests", { method: "POST", body });
}

export function trackRequest(token) {
  return apiFetch(`/api/requests/track/${token}`);
}

export function submitRevision(body) {
  return apiFetch("/api/revisions", { method: "POST", body });
}
