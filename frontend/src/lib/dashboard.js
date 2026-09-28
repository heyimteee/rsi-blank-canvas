import { apiFetch } from "./api.js";

export function listRequests(token, status) {
  const q = status ? `?status=${status}` : "";
  return apiFetch(`/api/requests${q}`, { token });
}

export function getRequest(token, id) {
  return apiFetch(`/api/requests/${id}`, { token });
}

export function decideRequest(token, id, decision, notes) {
  return apiFetch(`/api/requests/${id}/decision`, { method: "POST", token, body: { decision, notes } });
}

export function listRevisions(token, status) {
  const q = status ? `?status=${status}` : "";
  return apiFetch(`/api/revisions${q}`, { token });
}

export function getRevision(token, id) {
  return apiFetch(`/api/revisions/${id}`, { token });
}

export function decideRevision(token, id, payload) {
  return apiFetch(`/api/revisions/${id}/decision`, { method: "POST", token, body: payload });
}

export function listMilestones(token, requestId) {
  return apiFetch(`/api/revisions/request/${requestId}/milestones`, { token });
}

export function updateMilestone(token, mid, status) {
  return apiFetch(`/api/revisions/milestones/${mid}`, { method: "PUT", token, body: { status } });
}

export function listJobPool(token) {
  return apiFetch("/api/requests/pool/open", { token });
}
