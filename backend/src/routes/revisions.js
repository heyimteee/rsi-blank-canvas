import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { logNotification } from "../lib/notify.js";
import { sendMail } from "../lib/mailer.js";

const router = express.Router();

const TERMINAL = ["REJECTED", "REJECTED_NOTIFIED", "ACCEPTED_NOTIFIED", "LOGGED"];
const MILESTONE_STATUS = ["OPEN", "IN_PROGRESS", "DONE", "REVISED"];

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

async function mailRevision(to, revisionId, type, subject, html) {
  const id = await logNotification({
    recipient_email: to,
    type,
    payload: { revision_id: revisionId, subject },
  });
  await sendMail({ to, subject, html, notifId: id });
  return id;
}

router.post("/", async (req, res) => {
  const b = req.body || {};
  const service_request_id = Number(b.service_request_id);
  if (!Number.isInteger(service_request_id)) return res.status(400).json({ message: "Valid service_request_id is required" });
  if (!isValidEmail(String(b.client_email || "").toLowerCase())) return res.status(400).json({ message: "Valid client email is required" });
  if (!b.general_details || String(b.general_details).trim().length < 10)
    return res.status(400).json({ message: "General details must be at least 10 characters" });
  if (!b.terms || String(b.terms).trim().length < 4)
    return res.status(400).json({ message: "Terms must be at least 4 characters" });
  try {
    const exists = await pool.query("SELECT id FROM service_requests WHERE id = $1", [service_request_id]);
    if (exists.rows.length === 0) return res.status(404).json({ message: "Service request not found" });
    const email = String(b.client_email).toLowerCase();
    const r = await pool.query(
      "INSERT INTO revisions (service_request_id, client_email, general_details, terms, status) VALUES ($1, $2, $3, $4, 'NOTIFIED_PM') RETURNING id, status",
      [service_request_id, email, String(b.general_details).trim(), String(b.terms).trim()]
    );
    const id = r.rows[0].id;
    await logNotification({ recipient_email: null, type: "PM_REVIEW_NOTIFY", payload: { revision_id: id } });
    return res.status(201).json({ id, status: r.rows[0].status });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/", requireAuth, requireRole("pm", "admin"), async (req, res) => {
  try {
    const status = req.query.status;
    const r = status
      ? await pool.query("SELECT * FROM revisions WHERE status = $1 ORDER BY id DESC", [status])
      : await pool.query("SELECT * FROM revisions ORDER BY id DESC");
    return res.json({ items: r.rows });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/request/:id/milestones", requireAuth, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM milestones WHERE service_request_id = $1 ORDER BY sort_order ASC, id ASC", [
      req.params.id,
    ]);
    return res.json({ items: r.rows });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", requireAuth, requireRole("pm", "admin"), async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM revisions WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ message: "Revision not found" });
    return res.json(r.rows[0]);
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:id/decision", requireAuth, requireRole("pm", "admin"), async (req, res) => {
  const decision = req.body && req.body.decision;
  if (decision !== "accept" && decision !== "reject") {
    return res.status(400).json({ message: "Decision must be accept or reject" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query("SELECT * FROM revisions WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Revision not found" });
    }
    const row = cur.rows[0];
    if (TERMINAL.includes(row.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Decision already recorded" });
    }
    if (decision === "reject") {
      await client.query("UPDATE revisions SET status = 'REJECTED', decided_by = $1 WHERE id = $2", [
        req.user.id,
        req.params.id,
      ]);
      await client.query("COMMIT");
      await mailRevision(row.client_email, row.id, "REVISION_REJECT_ACK", "Update on your revision", "<p>We could not accept your revision.</p>");
      const done = await pool.query("SELECT status FROM revisions WHERE id = $1", [req.params.id]);
      return res.json({ id: Number(req.params.id), status: done.rows[0].status });
    }
    const concerns = req.body.separated_concerns;
    const milestones = req.body.milestones;
    if (!Array.isArray(concerns) || concerns.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "separated_concerns must be a non empty array" });
    }
    if (!Array.isArray(milestones) || milestones.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "milestones must be a non empty array" });
    }
    for (const m of milestones) {
      if (!m || !m.title || String(m.title).trim().length < 3) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Each milestone needs a title of at least 3 characters" });
      }
    }
    await client.query("UPDATE revisions SET status = 'SEPARATED', separated_concerns = $1, decided_by = $2 WHERE id = $3", [
      JSON.stringify(concerns),
      req.user.id,
      req.params.id,
    ]);
    let order = 0;
    for (const m of milestones) {
      order += 1;
      await client.query(
        "INSERT INTO milestones (service_request_id, revision_id, title, description, due_date, status, sort_order) VALUES ($1, $2, $3, $4, $5, 'OPEN', $6)",
        [
          row.service_request_id,
          row.id,
          String(m.title).trim(),
          m.description ? String(m.description) : null,
          m.due_date || null,
          order,
        ]
      );
    }
    await client.query("UPDATE revisions SET status = 'ACCEPTED_NOTIFIED' WHERE id = $1", [req.params.id]);
    await client.query("COMMIT");
    await mailRevision(row.client_email, row.id, "REVISION_ACCEPT_ACK", "Your revision was accepted", "<p>Milestones were updated for your revision.</p>");
    await logNotification({ recipient_email: null, type: "MEMBER_REVISION_NOTICE", payload: { revision_id: row.id } });
    const done = await pool.query("SELECT status FROM revisions WHERE id = $1", [req.params.id]);
    return res.json({ id: Number(req.params.id), status: done.rows[0].status });
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

router.put("/milestones/:mid", requireAuth, requireRole("pm", "admin"), async (req, res) => {
  const status = req.body && req.body.status;
  if (!MILESTONE_STATUS.includes(status)) {
    return res.status(400).json({ message: "Invalid milestone status" });
  }
  try {
    const r = await pool.query("UPDATE milestones SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *", [
      status,
      req.params.mid,
    ]);
    if (r.rows.length === 0) return res.status(404).json({ message: "Milestone not found" });
    return res.json(r.rows[0]);
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
