import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";
import { pool, initDb } from "../src/db.js";
import { requestTerms, revisionTerms } from "./support.js";

const DEFAULT_REASON = "Not within current project scope.";

async function makeUser(email, role) {
  await initDb();
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
  const r = await pool.query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role", [
    email,
    "hash",
    role,
  ]);
  const token = jwt.sign({ id: r.rows[0].id, email, role }, process.env.JWT_SECRET || "test-secret", { expiresIn: "1h" });
  return { user: r.rows[0], token };
}

async function makeRevision(stamp) {
  const clientEmail = `dec-${stamp}@example.com`;
  const created = await request(app).post("/api/requests").send({
    ...requestTerms(),
    client_name: "Decision Client",
    client_email: clientEmail,
    title: "Decision project",
    details: "Details for decision flow testing",
  });
  const rev = await request(app).post("/api/revisions").send({
    ...revisionTerms(),
    service_request_id: created.body.id,
    client_email: clientEmail,
    general_details: "Swap the pricing table copy",
  });
  return { requestId: created.body.id, revisionId: rev.body.id, clientEmail };
}

async function cleanup(requestId, revisionId, clientEmail) {
  await pool.query("DELETE FROM milestones WHERE service_request_id = $1", [requestId]);
  await pool.query("DELETE FROM revisions WHERE service_request_id = $1", [requestId]);
  await pool.query("DELETE FROM job_pool_posts WHERE service_request_id = $1", [requestId]);
  await pool.query("DELETE FROM service_requests WHERE id = $1", [requestId]);
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [clientEmail]);
  await pool.query("DELETE FROM notifications WHERE payload->>'revision_id' = $1", [String(revisionId)]);
  await pool.query("DELETE FROM notifications WHERE payload->>'request_id' = $1", [String(requestId)]);
}

test("accept needs no concerns and creates no milestones", async () => {
  const stamp = Date.now();
  const { token: pmToken } = await makeUser(`pma-${stamp}@example.com`, "pm");
  const job = await makeRevision(stamp);
  const res = await request(app)
    .post(`/api/revisions/${job.revisionId}/decision`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({ decision: "accept" });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ACCEPTED_NOTIFIED");
  assert.equal(res.body.reason, null);
  const ms = await pool.query("SELECT id FROM milestones WHERE service_request_id = $1", [job.requestId]);
  assert.equal(ms.rows.length, 0);
  await cleanup(job.requestId, job.revisionId, job.clientEmail);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});

test("reject keeps the given reason", async () => {
  const stamp = Date.now();
  const { token: pmToken } = await makeUser(`pmb-${stamp}@example.com`, "pm");
  const job = await makeRevision(stamp);
  const res = await request(app)
    .post(`/api/revisions/${job.revisionId}/decision`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({ decision: "reject", reason: "Out of agreed scope for this sprint." });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "REJECTED");
  assert.equal(res.body.reason, "Out of agreed scope for this sprint.");
  const row = await pool.query("SELECT decision_notes FROM revisions WHERE id = $1", [job.revisionId]);
  assert.equal(row.rows[0].decision_notes, "Out of agreed scope for this sprint.");
  await cleanup(job.requestId, job.revisionId, job.clientEmail);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});

test("reject without a reason stores the default message", async () => {
  const stamp = Date.now();
  const { token: pmToken } = await makeUser(`pmc-${stamp}@example.com`, "pm");
  const job = await makeRevision(stamp);
  const res = await request(app)
    .post(`/api/revisions/${job.revisionId}/decision`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({ decision: "reject" });
  assert.equal(res.status, 200);
  assert.equal(res.body.reason, DEFAULT_REASON);
  const row = await pool.query("SELECT decision_notes FROM revisions WHERE id = $1", [job.revisionId]);
  assert.equal(row.rows[0].decision_notes, DEFAULT_REASON);
  await cleanup(job.requestId, job.revisionId, job.clientEmail);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});

test("legacy concerns payload is ignored and double decision is blocked", async () => {
  const stamp = Date.now();
  const { token: pmToken } = await makeUser(`pmd-${stamp}@example.com`, "pm");
  const job = await makeRevision(stamp);
  const first = await request(app)
    .post(`/api/revisions/${job.revisionId}/decision`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({ decision: "accept", separated_concerns: [{ title: "Legacy" }], milestones: [{ title: "Legacy" }] });
  assert.equal(first.status, 200);
  const ms = await pool.query("SELECT id FROM milestones WHERE service_request_id = $1", [job.requestId]);
  assert.equal(ms.rows.length, 0);
  const second = await request(app)
    .post(`/api/revisions/${job.revisionId}/decision`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({ decision: "reject" });
  assert.equal(second.status, 409);
  await cleanup(job.requestId, job.revisionId, job.clientEmail);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});
