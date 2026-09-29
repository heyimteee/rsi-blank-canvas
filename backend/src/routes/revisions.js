import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { logNotification } from "../lib/notify.js";
import { sendMail } from "../lib/mailer.js";
import { ackEmail } from "../lib/templates.js";
import { pmOfJob } from "./jobs.js";

const router = express.Router();

const TERMINAL = ["REJECTED", "REJECTED_NOTIFIED", "ACCEPTED_NOTIFIED", "LOGGED"];
const MILESTONE_STATUS = ["OPEN", "IN_PROGRESS", "DONE", "REVISED"];
const TASK_STATUS = ["OPEN", "IN_PROGRESS", "DONE"];

function isIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function holdsSeat(requestId, userId) {
  const r = await pool.query(
    "SELECT id FROM job_slots WHERE service_request_id = $1 AND filled_by = $2 AND status = 'FILLED'",
    [requestId, userId]
  );
  return r.rows.length > 0;
}

async function canViewJob(requestId, userId) {
  const u = await pool.query("SELECT role FROM users WHERE id = $1", [userId]);
  if (u.rows[0] && u.rows[0].role === "exc") return true;
  if (await pmOfJob(requestId, userId)) return true;
  return holdsSeat(requestId, userId);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

async function mailRevision(to, revisionId, type, kind, projectTitle, token) {
  const built = ackEmail({ kind, projectTitle, token });
  const id = await logNotification({
    recipient_email: to,
    type,
    payload: { revision_id: revisionId, subject: built.subject },
  });
  await sendMail({ to, subject: built.subject, html: built.html, notifId: id });
  return id;
}

async function projectOf(requestId) {
  const r = await pool.query("SELECT title, tracking_token FROM service_requests WHERE id = $1", [requestId]);
  return r.rows[0] || { title: "Your project", tracking_token: null };
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
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId)) return res.status(400).json({ message: "Invalid request id" });
    if (!(await canViewJob(requestId, req.user.id))) {
      return res.status(403).json({ message: "You do not work on this job" });
    }
    const ms = await pool.query(
      "SELECT * FROM milestones WHERE service_request_id = $1 ORDER BY sort_order ASC, id ASC",
      [requestId]
    );
    const tasks =
      ms.rows.length === 0
        ? { rows: [] }
        : await pool.query(
            "SELECT t.*, u.email AS assignee_email, u.full_name AS assignee_name, s.role AS assignee_role FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN job_slots s ON s.service_request_id = $2 AND s.filled_by = t.assignee_id WHERE t.milestone_id = ANY($1) ORDER BY t.sort_order ASC, t.id ASC",
            [ms.rows.map((m) => m.id), requestId]
          );
    const items = ms.rows.map((m) => ({ ...m, tasks: tasks.rows.filter((t) => t.milestone_id === m.id) }));
    return res.json({ items });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/request/:requestId/milestones", requireAuth, requireRole("pm", "admin"), async (req, res) => {
  const requestId = Number(req.params.requestId);
  const b = req.body || {};
  if (!Number.isInteger(requestId)) return res.status(400).json({ message: "Invalid request id" });
  if (!b.title || String(b.title).trim().length < 3) {
    return res.status(400).json({ message: "Milestone title must be at least 3 characters" });
  }
  try {
    if (!(await pmOfJob(requestId, req.user.id))) {
      return res.status(403).json({ message: "Only this job's project manager plans work" });
    }
    const next = await pool.query(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM milestones WHERE service_request_id = $1",
      [requestId]
    );
    const r = await pool.query(
      "INSERT INTO milestones (service_request_id, title, description, status, sort_order) VALUES ($1, $2, $3, 'OPEN', $4) RETURNING *",
      [requestId, String(b.title).trim(), b.description ? String(b.description) : null, next.rows[0].n]
    );
    return res.status(201).json(r.rows[0]);
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/by-token/:token", async (req, res) => {
  try {
    const q = await pool.query("SELECT id FROM service_requests WHERE tracking_token = $1", [req.params.token]);
    if (q.rows.length === 0) return res.status(404).json({ message: "Request not found" });
    const r = await pool.query(
      "SELECT id, service_request_id, status, general_details, created_at FROM revisions WHERE service_request_id = $1 ORDER BY id DESC",
      [q.rows[0].id]
    );
    return res.json({ items: r.rows });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/milestones/:mid/tasks", requireAuth, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM tasks WHERE milestone_id = $1 ORDER BY sort_order ASC, id ASC", [
      req.params.mid,
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
      const proj = await projectOf(row.service_request_id);
      await mailRevision(row.client_email, row.id, "REVISION_REJECT_ACK", "revision_rejected", proj.title, proj.tracking_token ? String(proj.tracking_token) : null);
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
    const proj = await projectOf(row.service_request_id);
    await mailRevision(row.client_email, row.id, "REVISION_ACCEPT_ACK", "revision_accepted", proj.title, proj.tracking_token ? String(proj.tracking_token) : null);
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
  const b = req.body || {};
  try {
    const cur = await pool.query("SELECT * FROM milestones WHERE id = $1", [req.params.mid]);
    if (cur.rows.length === 0) return res.status(404).json({ message: "Milestone not found" });
    const row = cur.rows[0];
    if (!(await pmOfJob(row.service_request_id, req.user.id))) {
      return res.status(403).json({ message: "Only this job's project manager plans work" });
    }
    const patch = {};
    if (b.title !== undefined) {
      if (String(b.title).trim().length < 3) return res.status(400).json({ message: "Milestone title must be at least 3 characters" });
      patch.title = String(b.title).trim();
    }
    if (b.description !== undefined) patch.description = b.description ? String(b.description) : null;
    if (b.status !== undefined) {
      if (!MILESTONE_STATUS.includes(b.status)) return res.status(400).json({ message: "Invalid milestone status" });
      patch.status = b.status;
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ message: "Nothing to update" });
    const cols = Object.keys(patch);
    const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
    const r = await pool.query(`UPDATE milestones SET ${sets}, updated_at = NOW() WHERE id = $${cols.length + 1} RETURNING *`, [
      ...cols.map((c) => patch[c]),
      req.params.mid,
    ]);
    const out = r.rows[0];
    if (patch.status === "DONE") {
      const open = await pool.query("SELECT COUNT(*)::int AS n FROM tasks WHERE milestone_id = $1 AND status <> 'DONE'", [
        req.params.mid,
      ]);
      if (open.rows[0].n > 0) {
        return res.json({ ...out, warning: "Milestone marked done with open tasks", open_tasks: open.rows[0].n });
      }
    }
    return res.json(out);
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/milestones/:mid/tasks", requireAuth, requireRole("pm", "admin"), async (req, res) => {
  const b = req.body || {};
  if (!b.title || String(b.title).trim().length < 3) {
    return res.status(400).json({ message: "Task title must be at least 3 characters" });
  }
  try {
    const ms = await pool.query("SELECT service_request_id FROM milestones WHERE id = $1", [req.params.mid]);
    if (ms.rows.length === 0) return res.status(404).json({ message: "Milestone not found" });
    const requestId = ms.rows[0].service_request_id;
    if (!(await pmOfJob(requestId, req.user.id))) {
      return res.status(403).json({ message: "Only this job's project manager assigns tasks" });
    }
    let deadline = null;
    if (b.deadline !== undefined && b.deadline !== null && String(b.deadline) !== "") {
      if (!isIsoDate(b.deadline)) return res.status(400).json({ message: "Deadline must use the format YYYY-MM-DD" });
      if (String(b.deadline) < todayIso()) return res.status(400).json({ message: "Deadline cannot be in the past" });
      deadline = String(b.deadline);
    }
    let assignee = null;
    if (b.assignee_id !== undefined && b.assignee_id !== null) {
      const seat = await pool.query(
        "SELECT id FROM job_slots WHERE service_request_id = $1 AND filled_by = $2 AND status = 'FILLED'",
        [requestId, Number(b.assignee_id)]
      );
      if (seat.rows.length === 0) return res.status(400).json({ message: "Assignee holds no seat on this job" });
      assignee = Number(b.assignee_id);
    }
    const next = await pool.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM tasks WHERE milestone_id = $1", [
      req.params.mid,
    ]);
    const r = await pool.query(
      "INSERT INTO tasks (milestone_id, title, description, assignee_id, deadline, status, sort_order) VALUES ($1, $2, $3, $4, $5, 'OPEN', $6) RETURNING *",
      [req.params.mid, String(b.title).trim(), b.description ? String(b.description) : null, assignee, deadline, next.rows[0].n]
    );
    if (assignee) {
      const u = await pool.query("SELECT email FROM users WHERE id = $1", [assignee]);
      await logNotification({
        recipient_email: u.rows[0] && u.rows[0].email,
        recipient_user_id: assignee,
        type: "TASK_ASSIGNED",
        payload: { request_id: requestId, task_id: r.rows[0].id },
      });
    }
    return res.status(201).json(r.rows[0]);
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/tasks/:tid", requireAuth, requireRole("pm", "admin"), async (req, res) => {
  try {
    const cur = await pool.query(
      "SELECT t.id, m.service_request_id FROM tasks t JOIN milestones m ON m.id = t.milestone_id WHERE t.id = $1",
      [req.params.tid]
    );
    if (cur.rows.length === 0) return res.status(404).json({ message: "Task not found" });
    if (!(await pmOfJob(cur.rows[0].service_request_id, req.user.id))) {
      return res.status(403).json({ message: "Only this job's project manager removes tasks" });
    }
    await pool.query("DELETE FROM tasks WHERE id = $1", [req.params.tid]);
    return res.json({ id: Number(req.params.tid), deleted: true });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/tasks/:tid", requireAuth, async (req, res) => {
  const b = req.body || {};
  try {
    const cur = await pool.query(
      "SELECT t.*, m.service_request_id FROM tasks t JOIN milestones m ON m.id = t.milestone_id WHERE t.id = $1",
      [req.params.tid]
    );
    if (cur.rows.length === 0) return res.status(404).json({ message: "Task not found" });
    const row = cur.rows[0];
    const isPm = await pmOfJob(row.service_request_id, req.user.id);
    const isAssignee = row.assignee_id === req.user.id;
    if (!isPm && !isAssignee) return res.status(403).json({ message: "Only the assignee or project manager updates this task" });
    if (!isPm) {
      const keys = Object.keys(b);
      const onlyStatus = keys.length > 0 && keys.every((k) => k === "status");
      if (!onlyStatus || !TASK_STATUS.includes(b.status)) {
        return res.status(403).json({ message: "Assignees may only move task status" });
      }
      const r = await pool.query("UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *", [
        b.status,
        req.params.tid,
      ]);
      return res.json(r.rows[0]);
    }
    const patch = {};
    if (b.title !== undefined) {
      if (String(b.title).trim().length < 3) return res.status(400).json({ message: "Task title must be at least 3 characters" });
      patch.title = String(b.title).trim();
    }
    if (b.description !== undefined) patch.description = b.description ? String(b.description) : null;
    if (b.status !== undefined) {
      if (!TASK_STATUS.includes(b.status)) return res.status(400).json({ message: "Invalid task status" });
      patch.status = b.status;
    }
    if (b.deadline !== undefined) {
      if (b.deadline === null || b.deadline === "") {
        patch.deadline = null;
      } else {
        if (!isIsoDate(b.deadline)) return res.status(400).json({ message: "Deadline must use the format YYYY-MM-DD" });
        patch.deadline = String(b.deadline);
      }
    }
    if (b.assignee_id !== undefined) {
      if (b.assignee_id === null) {
        patch.assignee_id = null;
      } else {
        const seat = await pool.query(
          "SELECT id FROM job_slots WHERE service_request_id = $1 AND filled_by = $2 AND status = 'FILLED'",
          [row.service_request_id, Number(b.assignee_id)]
        );
        if (seat.rows.length === 0) return res.status(400).json({ message: "Assignee holds no seat on this job" });
        patch.assignee_id = Number(b.assignee_id);
      }
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ message: "Nothing to update" });
    const cols = Object.keys(patch);
    const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
    const r = await pool.query(`UPDATE tasks SET ${sets}, updated_at = NOW() WHERE id = $${cols.length + 1} RETURNING *`, [
      ...cols.map((c) => patch[c]),
      req.params.tid,
    ]);
    return res.json(r.rows[0]);
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
