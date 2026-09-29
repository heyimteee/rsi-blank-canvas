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

export function deleteRequest(token, id) {
  return apiFetch(`/api/requests/${id}`, { method: "DELETE", token });
}

export function getRequestFull(token, id) {
  return apiFetch(`/api/requests/${id}/full`, { token });
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

export function createMilestone(token, requestId, payload) {
  return apiFetch(`/api/revisions/request/${requestId}/milestones`, { method: "POST", token, body: payload });
}

export function updateMilestone(token, mid, payload) {
  return apiFetch(`/api/revisions/milestones/${mid}`, { method: "PUT", token, body: payload });
}

export function deleteTask(token, taskId) {
  return apiFetch(`/api/revisions/tasks/${taskId}`, { method: "DELETE", token });
}

export function listJobPool(token) {
  return apiFetch("/api/requests/pool/open", { token });
}

export function listSlots(token, requestId) {
  return apiFetch(`/api/jobs/${requestId}/slots`, { token });
}

export function applyToJob(token, requestId) {
  return apiFetch(`/api/jobs/${requestId}/apply`, { method: "POST", token, body: {} });
}

export function listApplications(token, requestId) {
  return apiFetch(`/api/jobs/${requestId}/applications`, { token });
}

export function decideApplication(token, appId, decision) {
  return apiFetch(`/api/jobs/applications/${appId}/decision`, { method: "POST", token, body: { decision } });
}

export function myActiveJob(token) {
  return apiFetch("/api/jobs/mine/active", { token });
}

export function requestLeave(token, requestId, reason) {
  return apiFetch(`/api/jobs/${requestId}/leave`, { method: "POST", token, body: { reason } });
}

export function listLeaveRequests(token, requestId) {
  return apiFetch(`/api/jobs/${requestId}/leave-requests`, { token });
}

export function decideLeave(token, leaveId, decision) {
  return apiFetch(`/api/jobs/leave/${leaveId}/decision`, { method: "POST", token, body: { decision } });
}

export function kickSeat(token, slotId) {
  return apiFetch(`/api/jobs/slots/${slotId}/kick`, { method: "POST", token, body: {} });
}

export function completeJob(token, requestId) {
  return apiFetch(`/api/jobs/${requestId}/complete`, { method: "POST", token, body: {} });
}

export function createTask(token, milestoneId, payload) {
  return apiFetch(`/api/revisions/milestones/${milestoneId}/tasks`, { method: "POST", token, body: payload });
}

export function updateTask(token, taskId, payload) {
  return apiFetch(`/api/revisions/tasks/${taskId}`, { method: "PUT", token, body: payload });
}
