import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";
import { pool, initDb } from "../src/db.js";
import { requestTerms, revisionTerms } from "./support.js";

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

async function fillSeat(requestId, excToken, userToken, userId) {
  await request(app).post(`/api/jobs/${requestId}/apply`).set("Authorization", `Bearer ${userToken}`).send({});
  const apps = await request(app).get(`/api/jobs/${requestId}/applications`).set("Authorization", `Bearer ${excToken}`);
  const appId = apps.body.items.find((a) => a.user_id === userId).id;
  await request(app).post(`/api/jobs/applications/${appId}/decision`).set("Authorization", `Bearer ${excToken}`).send({ decision: "approve" });
}

async function makeAcceptedRequest(clientEmail, excToken) {
  const created = await request(app).post("/api/requests").send({
    ...requestTerms(),
    client_name: "Work Client",
    client_email: clientEmail,
    title: "Work project",
    details: "Details for task detail delete testing",
  });
  await request(app).post(`/api/requests/${created.body.id}/decision`).set("Authorization", `Bearer ${excToken}`).send({ decision: "accept" });
  return created.body;
}

async function cleanupUsers(stamp) {
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
}

test("pm assigns tasks and assignee moves own status", async () => {
  const stamp = Date.now();
  const { token: excToken } = await makeUser(`excw-${stamp}@example.com`, "exc");
  const { token: pmToken, user: pmUser } = await makeUser(`pmw-${stamp}@example.com`, "pm");
  const { token: feToken } = await makeUser(`few-${stamp}@example.com`, "fe");
  const { token: beToken } = await makeUser(`bew-${stamp}@example.com`, "be");
  const created = await makeAcceptedRequest(`wk-${stamp}@example.com`, excToken);
  await fillSeat(created.id, excToken, pmToken, pmUser.id);
  const feId = (await pool.query("SELECT id FROM users WHERE email = $1", [`few-${stamp}@example.com`])).rows[0].id;
  await fillSeat(created.id, excToken, feToken, feId);
  const ms = await pool.query("INSERT INTO milestones (service_request_id, title) VALUES ($1, $2) RETURNING id", [created.id, "M1"]);
  const mid = ms.rows[0].id;
  const task = await request(app)
    .post(`/api/revisions/milestones/${mid}/tasks`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({ title: "Build hero", assignee_id: feId });
  assert.equal(task.status, 201);
  const tid = task.body.id;
  const stranger = await request(app).put(`/api/revisions/tasks/${tid}`).set("Authorization", `Bearer ${beToken}`).send({ status: "DONE" });
  assert.equal(stranger.status, 403);
  const mine = await request(app).put(`/api/revisions/tasks/${tid}`).set("Authorization", `Bearer ${feToken}`).send({ status: "IN_PROGRESS" });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.status, "IN_PROGRESS");
  const escalate = await request(app).put(`/api/revisions/tasks/${tid}`).set("Authorization", `Bearer ${feToken}`).send({ title: "Hijack" });
  assert.equal(escalate.status, 403);
  const pmEdit = await request(app).put(`/api/revisions/tasks/${tid}`).set("Authorization", `Bearer ${pmToken}`).send({ title: "Build hero v2", status: "DONE" });
  assert.equal(pmEdit.status, 200);
  await pool.query("DELETE FROM tasks WHERE milestone_id = $1", [mid]);
  await pool.query("DELETE FROM milestones WHERE id = $1", [mid]);
  await pool.query("DELETE FROM job_pool_posts WHERE service_request_id = $1", [created.id]);
  await pool.query("DELETE FROM service_requests WHERE id = $1", [created.id]);
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [`wk-${stamp}@example.com`]);
  await pool.query("DELETE FROM notifications WHERE payload->>'request_id' = $1", [String(created.id)]);
  await cleanupUsers(stamp);
});

test("exc full detail and whole project delete", async () => {
  const stamp = Date.now();
  const { token: excToken } = await makeUser(`excd-${stamp}@example.com`, "exc");
  const { token: pmToken, user: pmUser } = await makeUser(`pmd-${stamp}@example.com`, "pm");
  const created = await makeAcceptedRequest(`del-${stamp}@example.com`, excToken);
  await fillSeat(created.id, excToken, pmToken, pmUser.id);
  const rev = await request(app).post("/api/revisions").send({
    ...revisionTerms(),
    service_request_id: created.id,
    client_email: `del-${stamp}@example.com`,
    general_details: "Change footer copy everywhere",
    terms: "Minor change",
  });
  await request(app)
    .post(`/api/revisions/${rev.body.id}/decision`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({ decision: "accept", separated_concerns: [{ title: "Footer" }], milestones: [{ title: "Footer v2" }] });
  const full = await request(app).get(`/api/requests/${created.id}/full`).set("Authorization", `Bearer ${excToken}`);
  assert.equal(full.status, 200);
  assert.equal(full.body.request.id, created.id);
  assert.equal(full.body.slots.length, 4);
  assert.equal(full.body.milestones.length, 1);
  assert.equal(full.body.revisions.length, 1);
  const forbidden = await request(app).get(`/api/requests/${created.id}/full`).set("Authorization", `Bearer ${pmToken}`);
  assert.equal(forbidden.status, 403);
  const del = await request(app).delete(`/api/requests/${created.id}`).set("Authorization", `Bearer ${excToken}`);
  assert.equal(del.status, 200);
  for (const t of ["job_slots", "job_pool_posts", "applications", "leave_requests", "revisions", "milestones"]) {
    const col = t === "job_pool_posts" ? "service_request_id" : "service_request_id";
    const left = await pool.query(`SELECT id FROM ${t} WHERE ${col} = $1`, [created.id]);
    assert.equal(left.rows.length, 0);
  }
  const gone = await pool.query("SELECT id FROM service_requests WHERE id = $1", [created.id]);
  assert.equal(gone.rows.length, 0);
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [`del-${stamp}@example.com`]);
  await pool.query("DELETE FROM notifications WHERE payload->>'request_id' = $1", [String(created.id)]);
  await pool.query("DELETE FROM notifications WHERE payload->>'revision_id' = $1", [String(rev.body.id)]);
  await cleanupUsers(stamp);
});

test("revision lookup by tracking token is public", async () => {
  const stamp = Date.now();
  const { token: excToken } = await makeUser(`exct-${stamp}@example.com`, "exc");
  const created = await makeAcceptedRequest(`tk-${stamp}@example.com`, excToken);
  await request(app).post("/api/revisions").send({
    ...revisionTerms(),
    service_request_id: created.id,
    client_email: `tk-${stamp}@example.com`,
    general_details: "Tweak about page layout grid",
    terms: "Small tweak",
  });
  const res = await request(app).get(`/api/revisions/by-token/${created.tracking_token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].status, "NOTIFIED_PM");
  const miss = await request(app).get("/api/revisions/by-token/00000000-0000-0000-0000-000000000000");
  assert.equal(miss.status, 404);
  await pool.query("DELETE FROM revisions WHERE service_request_id = $1", [created.id]);
  await pool.query("DELETE FROM job_pool_posts WHERE service_request_id = $1", [created.id]);
  await pool.query("DELETE FROM service_requests WHERE id = $1", [created.id]);
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [`tk-${stamp}@example.com`]);
  await pool.query("DELETE FROM notifications WHERE payload->>'request_id' = $1", [String(created.id)]);
  await cleanupUsers(stamp);
});
