import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";
import { pool, initDb } from "../src/db.js";

async function makeUser(email, role) {
  await initDb();
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
  const r = await pool.query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role", [
    email,
    "hash",
    role,
  ]);
  const token = jwt.sign({ id: r.rows[0].id, email, role }, process.env.JWT_SECRET || "test-secret-for-intake", {
    expiresIn: "1h",
  });
  return { user: r.rows[0], token };
}

async function makeAcceptedRequest(clientEmail) {
  const created = await request(app).post("/api/requests").send({
    client_name: "Rev Client",
    client_email: clientEmail,
    title: "Revision project",
    details: "Project details for revision flow",
  });
  return created.body;
}

async function cleanupRequest(id, emails) {
  await pool.query("DELETE FROM milestones WHERE service_request_id = $1", [id]);
  await pool.query("DELETE FROM revisions WHERE service_request_id = $1", [id]);
  await pool.query("DELETE FROM job_pool_posts WHERE service_request_id = $1", [id]);
  await pool.query("DELETE FROM service_requests WHERE id = $1", [id]);
  for (const e of emails) {
    await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [e]);
  }
}

test("POST /api/revisions creates revision and notifies PM", async () => {
  const stamp = Date.now();
  const clientEmail = `rev-${stamp}@example.com`;
  const created = await makeAcceptedRequest(clientEmail);
  const res = await request(app).post("/api/revisions").send({
    service_request_id: created.id,
    client_email: clientEmail,
    general_details: "Change hero copy and pricing table",
    terms: "Within original scope, delivery in 5 days",
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.id);
  const rows = await pool.query("SELECT type FROM notifications WHERE payload->>'revision_id' = $1", [
    String(res.body.id),
  ]);
  assert.ok(rows.rows.map((r) => r.type).includes("PM_REVIEW_NOTIFY"));
  await pool.query("DELETE FROM notifications WHERE payload->>'revision_id' = $1", [String(res.body.id)]);
  await cleanupRequest(created.id, [clientEmail]);
});

test("POST /api/revisions rejects bad input", async () => {
  const bad = await request(app).post("/api/revisions").send({
    service_request_id: 999999,
    client_email: "bad",
    general_details: "x",
    terms: "y",
  });
  assert.equal(bad.status, 400);
});

test("PM reject ends flow with client ack", async () => {
  const stamp = Date.now();
  const clientEmail = `rej-${stamp}@example.com`;
  const { token: pmToken } = await makeUser(`pm-${stamp}@example.com`, "pm");
  const { token: memberToken } = await makeUser(`mem-${stamp}@example.com`, "member");
  const created = await makeAcceptedRequest(clientEmail);
  const rev = await request(app).post("/api/revisions").send({
    service_request_id: created.id,
    client_email: clientEmail,
    general_details: "Add dark mode",
    terms: "Extra scope, needs quote",
  });
  const id = rev.body.id;
  const noAuth = await request(app).post(`/api/revisions/${id}/decision`).send({ decision: "reject" });
  assert.equal(noAuth.status, 401);
  const forbidden = await request(app)
    .post(`/api/revisions/${id}/decision`)
    .set("Authorization", `Bearer ${memberToken}`)
    .send({ decision: "reject" });
  assert.equal(forbidden.status, 403);
  const done = await request(app)
    .post(`/api/revisions/${id}/decision`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({ decision: "reject" });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, "REJECTED");
  const notes = await pool.query("SELECT type FROM notifications WHERE recipient_email = $1", [clientEmail]);
  assert.ok(notes.rows.map((r) => r.type).includes("REVISION_REJECT_ACK"));
  const again = await request(app)
    .post(`/api/revisions/${id}/decision`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({ decision: "accept", separated_concerns: [{ title: "x" }], milestones: [{ title: "y" }] });
  assert.equal(again.status, 409);
  await pool.query("DELETE FROM notifications WHERE payload->>'revision_id' = $1", [String(id)]);
  await cleanupRequest(created.id, [clientEmail]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});

test("PM accept updates milestones and notifies all", async () => {
  const stamp = Date.now();
  const clientEmail = `acc-${stamp}@example.com`;
  const { token: pmToken } = await makeUser(`pma-${stamp}@example.com`, "pm");
  const created = await makeAcceptedRequest(clientEmail);
  const rev = await request(app).post("/api/revisions").send({
    service_request_id: created.id,
    client_email: clientEmail,
    general_details: "Update checkout copy",
    terms: "Minor copy change",
  });
  const id = rev.body.id;
  const badAccept = await request(app)
    .post(`/api/revisions/${id}/decision`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({ decision: "accept", separated_concerns: [], milestones: [] });
  assert.equal(badAccept.status, 400);
  const done = await request(app)
    .post(`/api/revisions/${id}/decision`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({
      decision: "accept",
      separated_concerns: [{ title: "Copy", note: "Hero" }],
      milestones: [{ title: "Hero copy v2", description: "Rewrite hero" }],
    });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, "ACCEPTED_NOTIFIED");
  const ms = await pool.query("SELECT * FROM milestones WHERE service_request_id = $1", [created.id]);
  assert.equal(ms.rows.length, 1);
  assert.equal(ms.rows[0].revision_id, id);
  const notes = await pool.query("SELECT type FROM notifications WHERE recipient_email = $1", [clientEmail]);
  assert.ok(notes.rows.map((r) => r.type).includes("REVISION_ACCEPT_ACK"));
  await pool.query("DELETE FROM notifications WHERE payload->>'revision_id' = $1", [String(id)]);
  await cleanupRequest(created.id, [clientEmail]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});

test("milestone read and update guard roles", async () => {
  const stamp = Date.now();
  const clientEmail = `ms-${stamp}@example.com`;
  const { token: pmToken } = await makeUser(`pmm-${stamp}@example.com`, "pm");
  const { token: memberToken } = await makeUser(`memm-${stamp}@example.com`, "member");
  const created = await makeAcceptedRequest(clientEmail);
  const outsider = await request(app)
    .get(`/api/revisions/request/${created.id}/milestones`)
    .set("Authorization", `Bearer ${memberToken}`);
  assert.equal(outsider.status, 403);
  const noAuth = await request(app).get(`/api/revisions/request/${created.id}/milestones`);
  assert.equal(noAuth.status, 401);
  const ins = await pool.query(
    "INSERT INTO milestones (service_request_id, title) VALUES ($1, $2) RETURNING id",
    [created.id, "M1"]
  );
  const mid = ins.rows[0].id;
  const onJob = await request(app)
    .get(`/api/revisions/request/${created.id}/milestones`)
    .set("Authorization", `Bearer ${pmToken}`);
  assert.equal(onJob.status, 200);
  const forbidden = await request(app)
    .put(`/api/revisions/milestones/${mid}`)
    .set("Authorization", `Bearer ${memberToken}`)
    .send({ status: "DONE" });
  assert.equal(forbidden.status, 403);
  const ok = await request(app)
    .put(`/api/revisions/milestones/${mid}`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({ status: "IN_PROGRESS" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "IN_PROGRESS");
  await pool.query("DELETE FROM tasks WHERE milestone_id = $1", [mid]);
  await pool.query("DELETE FROM milestones WHERE id = $1", [mid]);
  await cleanupRequest(created.id, [clientEmail]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});
