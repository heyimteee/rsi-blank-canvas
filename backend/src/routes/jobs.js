import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { logNotification } from "../lib/notify.js";

const router = express.Router();
const SEATS = ["pm", "fe", "be", "pd"];

async function hasActiveSeat(userId, excludeRequestId) {
  const r = await pool.query(
    "SELECT s.id FROM job_slots s JOIN service_requests q ON q.id = s.service_request_id WHERE s.filled_by = $1 AND s.status = 'FILLED' AND q.status = 'ACCEPTED' AND ($2::int IS NULL OR s.service_request_id <> $2)",
    [userId, excludeRequestId || null]
  );
  return r.rows.length > 0;
}

router.get("/mine/active", requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT s.id AS slot_id, s.role AS seat, s.service_request_id, q.title FROM job_slots s JOIN service_requests q ON q.id = s.service_request_id WHERE s.filled_by = $1 AND s.status = 'FILLED' AND q.status = 'ACCEPTED' LIMIT 1",
      [req.user.id]
    );
    if (r.rows.length === 0) return res.json({ active: null });
    return res.json({ active: r.rows[0], service_request_id: r.rows[0].service_request_id });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:requestId/slots", requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT s.id, s.role, s.status, s.filled_by, u.email AS occupant_email, u.full_name AS occupant_name FROM job_slots s LEFT JOIN users u ON u.id = s.filled_by WHERE s.service_request_id = $1 ORDER BY s.role",
      [req.params.requestId]
    );
    return res.json({ slots: r.rows });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:requestId/apply", requireAuth, async (req, res) => {
  const requestId = Number(req.params.requestId);
  if (!Number.isInteger(requestId)) return res.status(400).json({ message: "Invalid request id" });
  try {
    let role = req.user && req.user.role;
    if (!role || !SEATS.includes(role)) {
      const r = await pool.query("SELECT role FROM users WHERE id = $1", [req.user.id]);
      role = r.rows[0] && r.rows[0].role;
    }
    if (!SEATS.includes(role)) return res.status(400).json({ message: "Your role has no seat in the pool" });
    const q = await pool.query(
      "SELECT q.id, q.status, p.is_open FROM service_requests q LEFT JOIN job_pool_posts p ON p.service_request_id = q.id WHERE q.id = $1",
      [requestId]
    );
    if (q.rows.length === 0) return res.status(404).json({ message: "Request not found" });
    if (q.rows[0].status !== "ACCEPTED" || q.rows[0].is_open === false) {
      return res.status(400).json({ message: "This pool is not open" });
    }
    const seat = await pool.query("SELECT status FROM job_slots WHERE service_request_id = $1 AND role = $2", [
      requestId,
      role,
    ]);
    if (seat.rows.length === 0 || seat.rows[0].status !== "OPEN") {
      return res.status(400).json({ message: "Your seat is already taken" });
    }
    const dup = await pool.query(
      "SELECT id FROM applications WHERE service_request_id = $1 AND user_id = $2 AND status = 'PENDING'",
      [requestId, req.user.id]
    );
    if (dup.rows.length > 0) return res.status(409).json({ message: "You already applied to this job" });
    if (await hasActiveSeat(req.user.id, null)) {
      return res.status(400).json({ message: "You already hold an active job" });
    }
    const ins = await pool.query(
      "INSERT INTO applications (service_request_id, user_id, role, status) VALUES ($1, $2, $3, 'PENDING') RETURNING id, status",
      [requestId, req.user.id, role]
    );
    await logNotification({
      recipient_email: null,
      type: "POOL_APPLIED",
      payload: { request_id: requestId, user_id: req.user.id, role },
    });
    return res.status(201).json({ id: ins.rows[0].id, status: ins.rows[0].status });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:requestId/applications", requireAuth, requireRole("exc", "admin"), async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT a.id, a.service_request_id, a.user_id, a.role, a.status, a.created_at, u.email FROM applications a JOIN users u ON u.id = a.user_id WHERE a.service_request_id = $1 ORDER BY a.id",
      [req.params.requestId]
    );
    return res.json({ items: r.rows });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/applications/:appId/decision", requireAuth, requireRole("exc", "admin"), async (req, res) => {
  const decision = req.body && req.body.decision;
  if (decision !== "approve" && decision !== "reject") {
    return res.status(400).json({ message: "Decision must be approve or reject" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      "SELECT a.*, u.email AS user_email FROM applications a JOIN users u ON u.id = a.user_id WHERE a.id = $1 FOR UPDATE",
      [req.params.appId]
    );
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Application not found" });
    }
    const appRow = cur.rows[0];
    if (appRow.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Application already decided" });
    }
    if (decision === "reject") {
      await client.query("UPDATE applications SET status = 'REJECTED', decided_by = $1, decided_at = NOW() WHERE id = $2", [
        req.user.id,
        req.params.appId,
      ]);
      await client.query("COMMIT");
      await logNotification({
        recipient_email: appRow.user_email,
        recipient_user_id: appRow.user_id,
        type: "APPLICATION_DECIDED",
        payload: { request_id: appRow.service_request_id, outcome: "rejected" },
      });
      return res.json({ id: Number(req.params.appId), status: "REJECTED" });
    }
    const seat = await client.query(
      "SELECT id, status FROM job_slots WHERE service_request_id = $1 AND role = $2 FOR UPDATE",
      [appRow.service_request_id, appRow.role]
    );
    if (seat.rows.length === 0 || seat.rows[0].status !== "OPEN") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Seat is no longer open" });
    }
    const busy = await client.query(
      "SELECT s.id FROM job_slots s JOIN service_requests q ON q.id = s.service_request_id WHERE s.filled_by = $1 AND s.status = 'FILLED' AND q.status = 'ACCEPTED'",
      [appRow.user_id]
    );
    if (busy.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Applicant already holds an active job" });
    }
    await client.query("UPDATE job_slots SET status = 'FILLED', filled_by = $1 WHERE id = $2", [
      appRow.user_id,
      seat.rows[0].id,
    ]);
    await client.query("UPDATE applications SET status = 'APPROVED', decided_by = $1, decided_at = NOW() WHERE id = $2", [
      req.user.id,
      req.params.appId,
    ]);
    await client.query(
      "UPDATE applications SET status = 'REJECTED', decided_by = $1, decided_at = NOW() WHERE service_request_id = $2 AND role = $3 AND status = 'PENDING' AND id <> $4",
      [req.user.id, appRow.service_request_id, appRow.role, req.params.appId]
    );
    await client.query("COMMIT");
    await logNotification({
      recipient_email: appRow.user_email,
      recipient_user_id: appRow.user_id,
      type: "APPLICATION_DECIDED",
      payload: { request_id: appRow.service_request_id, outcome: "approved" },
    });
    return res.json({ id: Number(req.params.appId), status: "APPROVED" });
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
  }
});

export async function pmOfJob(requestId, userId) {
  const me = await pool.query("SELECT role FROM users WHERE id = $1", [userId]);
  if (!me.rows[0] || me.rows[0].role !== "pm") return false;
  const seat = await pool.query("SELECT filled_by FROM job_slots WHERE service_request_id = $1 AND role = 'pm'", [
    requestId,
  ]);
  if (seat.rows.length === 0) return true;
  if (seat.rows[0].filled_by === null) return true;
  return seat.rows[0].filled_by === userId;
}

router.post("/:requestId/leave", requireAuth, async (req, res) => {
  const requestId = Number(req.params.requestId);
  if (!Number.isInteger(requestId)) return res.status(400).json({ message: "Invalid request id" });
  try {
    const seat = await pool.query(
      "SELECT id FROM job_slots WHERE service_request_id = $1 AND filled_by = $2 AND status = 'FILLED'",
      [requestId, req.user.id]
    );
    if (seat.rows.length === 0) return res.status(400).json({ message: "You hold no seat on this job" });
    const dup = await pool.query(
      "SELECT id FROM leave_requests WHERE service_request_id = $1 AND user_id = $2 AND status = 'PENDING'",
      [requestId, req.user.id]
    );
    if (dup.rows.length > 0) return res.status(409).json({ message: "Leave request already pending" });
    const ins = await pool.query(
      "INSERT INTO leave_requests (service_request_id, user_id, reason, status) VALUES ($1, $2, $3, 'PENDING') RETURNING id, status",
      [requestId, req.user.id, req.body && req.body.reason ? String(req.body.reason) : null]
    );
    await logNotification({
      recipient_email: null,
      type: "LEAVE_REQUESTED",
      payload: { request_id: requestId, user_id: req.user.id },
    });
    return res.status(201).json({ id: ins.rows[0].id, status: ins.rows[0].status });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:requestId/leave-requests", requireAuth, requireRole("pm", "admin"), async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT l.id, l.service_request_id, l.user_id, l.reason, l.status, l.created_at, u.email FROM leave_requests l JOIN users u ON u.id = l.user_id WHERE l.service_request_id = $1 ORDER BY l.id",
      [req.params.requestId]
    );
    return res.json({ items: r.rows });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/leave/:leaveId/decision", requireAuth, requireRole("pm", "admin"), async (req, res) => {
  const decision = req.body && req.body.decision;
  if (decision !== "accept" && decision !== "reject") {
    return res.status(400).json({ message: "Decision must be accept or reject" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      "SELECT l.*, u.email AS user_email FROM leave_requests l JOIN users u ON u.id = l.user_id WHERE l.id = $1 FOR UPDATE",
      [req.params.leaveId]
    );
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Leave request not found" });
    }
    const row = cur.rows[0];
    if (row.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Leave request already decided" });
    }
    if (!(await pmOfJob(row.service_request_id, req.user.id))) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Only this job's project manager decides" });
    }
    if (decision === "reject") {
      await client.query("UPDATE leave_requests SET status = 'REJECTED', decided_by = $1, decided_at = NOW() WHERE id = $2", [
        req.user.id,
        req.params.leaveId,
      ]);
      await client.query("COMMIT");
      await logNotification({
        recipient_email: row.user_email,
        recipient_user_id: row.user_id,
        type: "LEAVE_DECIDED",
        payload: { request_id: row.service_request_id, outcome: "rejected" },
      });
      return res.json({ id: Number(req.params.leaveId), status: "REJECTED" });
    }
    await client.query("UPDATE leave_requests SET status = 'APPROVED', decided_by = $1, decided_at = NOW() WHERE id = $2", [
      req.user.id,
      req.params.leaveId,
    ]);
    await client.query(
      "UPDATE job_slots SET status = 'OPEN', filled_by = NULL WHERE service_request_id = $1 AND filled_by = $2 AND status = 'FILLED'",
      [row.service_request_id, row.user_id]
    );
    await client.query("COMMIT");
    await logNotification({
      recipient_email: row.user_email,
      recipient_user_id: row.user_id,
      type: "LEAVE_DECIDED",
      payload: { request_id: row.service_request_id, outcome: "approved" },
    });
    return res.json({ id: Number(req.params.leaveId), status: "APPROVED" });
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
  }
});

router.post("/slots/:slotId/kick", requireAuth, requireRole("pm", "admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query("SELECT * FROM job_slots WHERE id = $1 FOR UPDATE", [req.params.slotId]);
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Seat not found" });
    }
    const seat = cur.rows[0];
    if (!(await pmOfJob(seat.service_request_id, req.user.id))) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Only this job's project manager removes members" });
    }
    if (seat.status !== "FILLED" || seat.filled_by === null) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Seat is already open" });
    }
    const kicked = seat.filled_by;
    await client.query("UPDATE job_slots SET status = 'OPEN', filled_by = NULL WHERE id = $1", [req.params.slotId]);
    await client.query(
      "UPDATE leave_requests SET status = 'REJECTED', decided_by = $1, decided_at = NOW() WHERE service_request_id = $2 AND user_id = $3 AND status = 'PENDING'",
      [req.user.id, seat.service_request_id, kicked]
    );
    await client.query("COMMIT");
    const u = await pool.query("SELECT email FROM users WHERE id = $1", [kicked]);
    await logNotification({
      recipient_email: u.rows[0] && u.rows[0].email,
      recipient_user_id: kicked,
      type: "KICKED",
      payload: { request_id: seat.service_request_id },
    });
    return res.json({ id: Number(req.params.slotId), status: "OPEN" });
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
  }
});

router.post("/:requestId/complete", requireAuth, requireRole("pm", "admin"), async (req, res) => {
  const requestId = Number(req.params.requestId);
  if (!Number.isInteger(requestId)) return res.status(400).json({ message: "Invalid request id" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query("SELECT status FROM service_requests WHERE id = $1 FOR UPDATE", [requestId]);
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Request not found" });
    }
    if (cur.rows[0].status !== "ACCEPTED") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Only an active job can be completed" });
    }
    if (!(await pmOfJob(requestId, req.user.id))) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Only this job's project manager completes it" });
    }
    await client.query("UPDATE service_requests SET status = 'COMPLETED' WHERE id = $1", [requestId]);
    await client.query("UPDATE job_pool_posts SET is_open = FALSE WHERE service_request_id = $1", [requestId]);
    await client.query("COMMIT");
    await logNotification({ recipient_email: null, type: "JOB_COMPLETED", payload: { request_id: requestId } });
    return res.json({ id: requestId, status: "COMPLETED" });
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
  }
});

export default router;
