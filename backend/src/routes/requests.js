import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { logNotification } from "../lib/notify.js";
import { sendMail } from "../lib/mailer.js";
import { ackEmail } from "../lib/templates.js";
import { isIsoDate, todayIso, CURRENCIES } from "../lib/terms.js";

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function validateSubmit(b) {
  if (!b || typeof b !== "object") return "Invalid payload";
  if (!b.client_name || String(b.client_name).trim().length < 2) return "Client name is required";
  if (!isValidEmail(String(b.client_email || "").toLowerCase())) return "Valid client email is required";
  if (!b.title || String(b.title).trim().length < 4) return "Title must be at least 4 characters";
  if (!b.details || String(b.details).trim().length < 10) return "Details must be at least 10 characters";
  const amount = Number(b.budget_amount);
  if (!Number.isFinite(amount) || amount <= 0) return "Budget amount must be a positive number";
  if (!CURRENCIES.includes(b.budget_currency)) return "Budget currency must be IDR or USD";
  if (!isIsoDate(b.deadline)) return "Deadline must use the format YYYY-MM-DD";
  if (String(b.deadline) < todayIso()) return "Deadline cannot be in the past";
  return null;
}

async function mail(to, type, kind, projectTitle, token) {
  const built = ackEmail({ kind, projectTitle, token });
  const id = await logNotification({ recipient_email: to, type, payload: { subject: built.subject } });
  await sendMail({ to, subject: built.subject, html: built.html, notifId: id });
  return id;
}

router.post("/", async (req, res) => {
  const err = validateSubmit(req.body);
  if (err) return res.status(400).json({ message: err });
  const b = req.body;
  const email = String(b.client_email).toLowerCase();
  try {
    const r = await pool.query(
      "INSERT INTO service_requests (client_name, client_email, client_org, title, details, budget_range, timeline, attachment_url, budget_amount, budget_currency, deadline, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'RECEIVED') RETURNING id, tracking_token, status",
      [
        String(b.client_name).trim(),
        email,
        b.client_org ? String(b.client_org).trim() : null,
        String(b.title).trim(),
        String(b.details).trim(),
        b.budget_range ? String(b.budget_range) : null,
        b.timeline ? String(b.timeline) : null,
        b.attachment_url ? String(b.attachment_url) : null,
        Number(b.budget_amount),
        String(b.budget_currency),
        String(b.deadline),
      ]
    );
    const row = r.rows[0];
    await pool.query("UPDATE service_requests SET status = 'ACK_SENT' WHERE id = $1", [row.id]);
    await mail(email, "INITIAL_ACK", "initial", String(b.title).trim(), String(row.tracking_token));
    await logNotification({ recipient_email: null, type: "EXC_REVIEW_NOTIFY", payload: { request_id: row.id } });
    await pool.query("UPDATE service_requests SET status = 'PENDING_DECISION' WHERE id = $1", [row.id]);
    return res.status(201).json({ id: row.id, tracking_token: row.tracking_token, status: "PENDING_DECISION" });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/track/:token", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, tracking_token, title, status, created_at, decided_at FROM service_requests WHERE tracking_token = $1",
      [req.params.token]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "Request not found" });
    return res.json(r.rows[0]);
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/", requireAuth, requireRole("exc", "admin"), async (req, res) => {
  try {
    const status = req.query.status;
    const r = status
      ? await pool.query("SELECT * FROM service_requests WHERE status = $1 ORDER BY id DESC", [status])
      : await pool.query("SELECT * FROM service_requests ORDER BY id DESC");
    return res.json({ items: r.rows });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/pool/open", requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT s.id, s.title, s.client_name, s.status, s.created_at, p.opened_at FROM service_requests s JOIN job_pool_posts p ON p.service_request_id = s.id WHERE p.is_open = TRUE AND s.status = 'ACCEPTED' ORDER BY p.opened_at DESC"
    );
    return res.json({ items: r.rows });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id/full", requireAuth, requireRole("exc", "admin"), async (req, res) => {
  try {
    const q = await pool.query("SELECT * FROM service_requests WHERE id = $1", [req.params.id]);
    if (q.rows.length === 0) return res.status(404).json({ message: "Request not found" });
    const slots = await pool.query(
      "SELECT s.id, s.role, s.status, s.filled_by, u.email AS occupant_email, u.full_name AS occupant_name FROM job_slots s LEFT JOIN users u ON u.id = s.filled_by WHERE s.service_request_id = $1 ORDER BY s.role",
      [req.params.id]
    );
    const milestones = await pool.query(
      "SELECT * FROM milestones WHERE service_request_id = $1 ORDER BY sort_order ASC, id ASC",
      [req.params.id]
    );
    const tasks =
      milestones.rows.length === 0
        ? { rows: [] }
        : await pool.query("SELECT * FROM tasks WHERE milestone_id = ANY($1) ORDER BY sort_order ASC, id ASC", [
            milestones.rows.map((m) => m.id),
          ]);
    const revisions = await pool.query("SELECT * FROM revisions WHERE service_request_id = $1 ORDER BY id DESC", [
      req.params.id,
    ]);
    return res.json({ request: q.rows[0], slots: slots.rows, milestones: milestones.rows, tasks: tasks.rows, revisions: revisions.rows });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireRole("exc", "admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query("SELECT id FROM service_requests WHERE id = $1", [req.params.id]);
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Request not found" });
    }
    const id = Number(req.params.id);
    await client.query("DELETE FROM job_slots WHERE service_request_id = $1", [id]);
    await client.query("DELETE FROM applications WHERE service_request_id = $1", [id]);
    await client.query("DELETE FROM leave_requests WHERE service_request_id = $1", [id]);
    await client.query("DELETE FROM job_pool_posts WHERE service_request_id = $1", [id]);
    await client.query("DELETE FROM milestones WHERE service_request_id = $1", [id]);
    await client.query("DELETE FROM revisions WHERE service_request_id = $1", [id]);
    await client.query("DELETE FROM service_requests WHERE id = $1", [id]);
    await client.query("COMMIT");
    return res.json({ id, deleted: true });
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

router.get("/:id", requireAuth, requireRole("exc", "pm", "admin"), async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM service_requests WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ message: "Request not found" });
    return res.json(r.rows[0]);
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:id/decision", requireAuth, requireRole("exc", "admin"), async (req, res) => {
  const decision = req.body && req.body.decision;
  const notes = req.body && req.body.notes ? String(req.body.notes) : null;
  if (decision !== "accept" && decision !== "reject") {
    return res.status(400).json({ message: "Decision must be accept or reject" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query("SELECT * FROM service_requests WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Request not found" });
    }
    const row = cur.rows[0];
    if (row.status === "ACCEPTED" || row.status === "REJECTED" || row.status === "JOB_POOL_OPEN") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Decision already recorded" });
    }
    if (decision === "accept") {
      await client.query(
        "UPDATE service_requests SET status = 'ACCEPTED', decided_by = $1, decision_notes = $2, decided_at = NOW() WHERE id = $3",
        [req.user.id, notes, req.params.id]
      );
      await client.query("INSERT INTO job_pool_posts (service_request_id) VALUES ($1) ON CONFLICT DO NOTHING", [
        req.params.id,
      ]);
      for (const seat of ["pm", "fe", "be", "pd"]) {
        await client.query(
          "INSERT INTO job_slots (service_request_id, role, status) VALUES ($1, $2, 'OPEN') ON CONFLICT DO NOTHING",
          [req.params.id, seat]
        );
      }
      await client.query("COMMIT");
      await mail(row.client_email, "ACCEPTANCE_ACK", "accepted", row.title, String(row.tracking_token));
      await logNotification({ recipient_email: null, type: "JOB_POOL_BROADCAST", payload: { request_id: row.id } });
      const done = await pool.query("SELECT status FROM service_requests WHERE id = $1", [req.params.id]);
      return res.json({ id: Number(req.params.id), status: done.rows[0].status });
    }
    await client.query(
      "UPDATE service_requests SET status = 'REJECTED', decided_by = $1, decision_notes = $2, decided_at = NOW() WHERE id = $3",
      [req.user.id, notes, req.params.id]
    );
    await client.query("COMMIT");
    await mail(row.client_email, "REJECTION_ACK", "rejected", row.title, String(row.tracking_token));
    return res.json({ id: Number(req.params.id), status: "REJECTED" });
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
