import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { logNotification } from "../lib/notify.js";
import { sendMail } from "../lib/mailer.js";

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
  return null;
}

async function mail(to, type, subject, html) {
  const id = await logNotification({ recipient_email: to, type, payload: { subject } });
  await sendMail({ to, subject, html, notifId: id });
  return id;
}

router.post("/", async (req, res) => {
  const err = validateSubmit(req.body);
  if (err) return res.status(400).json({ message: err });
  const b = req.body;
  const email = String(b.client_email).toLowerCase();
  try {
    const r = await pool.query(
      "INSERT INTO service_requests (client_name, client_email, client_org, title, details, budget_range, timeline, attachment_url, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'RECEIVED') RETURNING id, tracking_token, status",
      [
        String(b.client_name).trim(),
        email,
        b.client_org ? String(b.client_org).trim() : null,
        String(b.title).trim(),
        String(b.details).trim(),
        b.budget_range ? String(b.budget_range) : null,
        b.timeline ? String(b.timeline) : null,
        b.attachment_url ? String(b.attachment_url) : null,
      ]
    );
    const row = r.rows[0];
    await pool.query("UPDATE service_requests SET status = 'ACK_SENT' WHERE id = $1", [row.id]);
    await mail(email, "INITIAL_ACK", "We received your request", `<p>Thanks. Your tracking token is ${row.tracking_token}.</p>`);
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
      await client.query("COMMIT");
      await mail(row.client_email, "ACCEPTANCE_ACK", "Your request was accepted", "<p>Your request was accepted and the job pool is now open.</p>");
      await logNotification({ recipient_email: null, type: "JOB_POOL_BROADCAST", payload: { request_id: row.id } });
      const done = await pool.query("SELECT status FROM service_requests WHERE id = $1", [req.params.id]);
      return res.json({ id: Number(req.params.id), status: done.rows[0].status });
    }
    await client.query(
      "UPDATE service_requests SET status = 'REJECTED', decided_by = $1, decision_notes = $2, decided_at = NOW() WHERE id = $3",
      [req.user.id, notes, req.params.id]
    );
    await client.query("COMMIT");
    await mail(row.client_email, "REJECTION_ACK", "Update on your request", "<p>We could not take your request at this time.</p>");
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
