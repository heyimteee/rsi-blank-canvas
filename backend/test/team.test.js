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
    client_name: "Team Client",
    client_email: clientEmail,
    title: "Team project",
    details: "Details for leave kick complete testing",
  });
  await request(app).post(`/api/requests/${created.body.id}/decision`).set("Authorization", `Bearer ${excToken}`).send({ decision: "accept" });
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
  await pool.query("DELETE FROM notifications WHERE payload->>'request_id' = $1", [String(id)]);
}

test("leave request accepted frees the seat", async () => {
  const stamp = Date.now();
  const { token: excToken } = await makeUser(`excl-${stamp}@example.com`, "exc");
  const { token: pmToken, user: pmUser } = await makeUser(`pml-${stamp}@example.com`, "pm");
  const { token: feToken } = await makeUser(`fel-${stamp}@example.com`, "fe");
  const created = await makeAcceptedRequest(`lv-${stamp}@example.com`, excToken);
  await fillSeat(created.id, excToken, pmToken, pmUser.id);
  const feId = (await pool.query("SELECT id FROM users WHERE email = $1", [`fel-${stamp}@example.com`])).rows[0].id;
  await fillSeat(created.id, excToken, feToken, feId);
  const leave = await request(app).post(`/api/jobs/${created.id}/leave`).set("Authorization", `Bearer ${feToken}`).send({ reason: "Busy month" });
  assert.equal(leave.status, 201);
  const dup = await request(app).post(`/api/jobs/${created.id}/leave`).set("Authorization", `Bearer ${feToken}`).send({});
  assert.equal(dup.status, 409);
  const queue = await request(app).get(`/api/jobs/${created.id}/leave-requests`).set("Authorization", `Bearer ${pmToken}`);
  assert.equal(queue.status, 200);
  const leaveId = queue.body.items.find((x) => x.user_id === feId).id;
  const dec = await request(app).post(`/api/jobs/leave/${leaveId}/decision`).set("Authorization", `Bearer ${pmToken}`).send({ decision: "accept" });
  assert.equal(dec.status, 200);
  const slots = await request(app).get(`/api/jobs/${created.id}/slots`).set("Authorization", `Bearer ${pmToken}`);
  assert.equal(slots.body.slots.find((s) => s.role === "fe").status, "OPEN");
  const mine = await request(app).get("/api/jobs/mine/active").set("Authorization", `Bearer ${feToken}`);
  assert.equal(mine.body.active, null);
  await cleanupRequest(created.id, [`lv-${stamp}@example.com`]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});

test("leave rejected keeps the seat and kick rules hold", async () => {
  const stamp = Date.now();
  const { token: excToken } = await makeUser(`exck-${stamp}@example.com`, "exc");
  const { token: pmToken, user: pmUser } = await makeUser(`pmk-${stamp}@example.com`, "pm");
  const { token: pmOther } = await makeUser(`pmo-${stamp}@example.com`, "pm");
  const { token: feToken } = await makeUser(`fek-${stamp}@example.com`, "fe");
  const created = await makeAcceptedRequest(`kk-${stamp}@example.com`, excToken);
  await fillSeat(created.id, excToken, pmToken, pmUser.id);
  const feId = (await pool.query("SELECT id FROM users WHERE email = $1", [`fek-${stamp}@example.com`])).rows[0].id;
  await fillSeat(created.id, excToken, feToken, feId);
  const leave = await request(app).post(`/api/jobs/${created.id}/leave`).set("Authorization", `Bearer ${feToken}`).send({});
  const queue = await request(app).get(`/api/jobs/${created.id}/leave-requests`).set("Authorization", `Bearer ${pmToken}`);
  const leaveId = queue.body.items.find((x) => x.user_id === feId).id;
  void leave;
  const rej = await request(app).post(`/api/jobs/leave/${leaveId}/decision`).set("Authorization", `Bearer ${pmToken}`).send({ decision: "reject" });
  assert.equal(rej.status, 200);
  const stranger = await request(app).get(`/api/jobs/${created.id}/slots`).set("Authorization", `Bearer ${pmToken}`);
  assert.equal(stranger.body.slots.find((s) => s.role === "fe").status, "FILLED");
  const outsiderKick = await request(app)
    .post(`/api/jobs/slots/${stranger.body.slots.find((s) => s.role === "fe").id}/kick`)
    .set("Authorization", `Bearer ${pmOther}`)
    .send({});
  assert.equal(outsiderKick.status, 403);
  const kick = await request(app)
    .post(`/api/jobs/slots/${stranger.body.slots.find((s) => s.role === "fe").id}/kick`)
    .set("Authorization", `Bearer ${pmToken}`)
    .send({});
  assert.equal(kick.status, 200);
  const after = await request(app).get(`/api/jobs/${created.id}/slots`).set("Authorization", `Bearer ${pmToken}`);
  assert.equal(after.body.slots.find((s) => s.role === "fe").status, "OPEN");
  await cleanupRequest(created.id, [`kk-${stamp}@example.com`]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});

test("pm completion frees the whole team", async () => {
  const stamp = Date.now();
  const { token: excToken } = await makeUser(`excm-${stamp}@example.com`, "exc");
  const { token: pmToken, user: pmUser } = await makeUser(`pmm-${stamp}@example.com`, "pm");
  const { token: beToken } = await makeUser(`bem-${stamp}@example.com`, "be");
  const created = await makeAcceptedRequest(`cp-${stamp}@example.com`, excToken);
  await fillSeat(created.id, excToken, pmToken, pmUser.id);
  const beId = (await pool.query("SELECT id FROM users WHERE email = $1", [`bem-${stamp}@example.com`])).rows[0].id;
  await fillSeat(created.id, excToken, beToken, beId);
  const done = await request(app).post(`/api/jobs/${created.id}/complete`).set("Authorization", `Bearer ${pmToken}`).send({});
  assert.equal(done.status, 200);
  assert.equal(done.body.status, "COMPLETED");
  const mine = await request(app).get("/api/jobs/mine/active").set("Authorization", `Bearer ${beToken}`);
  assert.equal(mine.body.active, null);
  const again = await request(app).post(`/api/jobs/${created.id}/apply`).set("Authorization", `Bearer ${beToken}`).send({});
  assert.equal(again.status, 400);
  await cleanupRequest(created.id, [`cp-${stamp}@example.com`]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});
