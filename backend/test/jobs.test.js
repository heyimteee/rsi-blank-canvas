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

async function makeAcceptedRequest(clientEmail, excToken) {
  const created = await request(app).post("/api/requests").send({
    client_name: "Seat Client",
    client_email: clientEmail,
    title: "Seat project",
    details: "Details for seat flow testing",
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

test("accepting a request opens four discipline seats", async () => {
  const stamp = Date.now();
  const { token: excToken } = await makeUser(`excs-${stamp}@example.com`, "exc");
  const created = await makeAcceptedRequest(`seat-${stamp}@example.com`, excToken);
  const res = await request(app).get(`/api/jobs/${created.id}/slots`).set("Authorization", `Bearer ${excToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.slots.length, 4);
  assert.deepEqual(res.body.slots.map((s) => s.role).sort(), ["be", "fe", "pd", "pm"]);
  assert.ok(res.body.slots.every((s) => s.status === "OPEN"));
  await cleanupRequest(created.id, [`seat-${stamp}@example.com`]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});

test("apply validates discipline and blocks duplicates", async () => {
  const stamp = Date.now();
  const { token: excToken } = await makeUser(`exca-${stamp}@example.com`, "exc");
  const { token: feToken } = await makeUser(`fea-${stamp}@example.com`, "fe");
  const { token: memberToken } = await makeUser(`mema-${stamp}@example.com`, "member");
  const created = await makeAcceptedRequest(`ap-${stamp}@example.com`, excToken);
  const ok = await request(app).post(`/api/jobs/${created.id}/apply`).set("Authorization", `Bearer ${feToken}`).send({});
  assert.equal(ok.status, 201);
  const dup = await request(app).post(`/api/jobs/${created.id}/apply`).set("Authorization", `Bearer ${feToken}`).send({});
  assert.equal(dup.status, 409);
  const legacy = await request(app).post(`/api/jobs/${created.id}/apply`).set("Authorization", `Bearer ${memberToken}`).send({});
  assert.equal(legacy.status, 400);
  const noAuth = await request(app).post(`/api/jobs/${created.id}/apply`).send({});
  assert.equal(noAuth.status, 401);
  await cleanupRequest(created.id, [`ap-${stamp}@example.com`]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});

test("member holding a seat cannot apply elsewhere", async () => {
  const stamp = Date.now();
  const { token: excToken } = await makeUser(`excb-${stamp}@example.com`, "exc");
  const { token: feToken, user: feUser } = await makeUser(`feb-${stamp}@example.com`, "fe");
  const first = await makeAcceptedRequest(`f1-${stamp}@example.com`, excToken);
  const second = await makeAcceptedRequest(`f2-${stamp}@example.com`, excToken);
  await request(app).post(`/api/jobs/${first.id}/apply`).set("Authorization", `Bearer ${feToken}`).send({});
  const apps = await request(app).get(`/api/jobs/${first.id}/applications`).set("Authorization", `Bearer ${excToken}`);
  const appId = apps.body.items.find((a) => a.user_id === feUser.id).id;
  const dec = await request(app).post(`/api/jobs/applications/${appId}/decision`).set("Authorization", `Bearer ${excToken}`).send({ decision: "approve" });
  assert.equal(dec.status, 200);
  const blocked = await request(app).post(`/api/jobs/${second.id}/apply`).set("Authorization", `Bearer ${feToken}`).send({});
  assert.equal(blocked.status, 400);
  const mine = await request(app).get("/api/jobs/mine/active").set("Authorization", `Bearer ${feToken}`);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.service_request_id, first.id);
  await cleanupRequest(first.id, [`f1-${stamp}@example.com`]);
  await cleanupRequest(second.id, [`f2-${stamp}@example.com`]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});

test("approve fills seat and clears rival pendings", async () => {
  const stamp = Date.now();
  const { token: excToken } = await makeUser(`excc-${stamp}@example.com`, "exc");
  const { token: pmOne, user: pmOneUser } = await makeUser(`pm1-${stamp}@example.com`, "pm");
  const { token: pmTwo, user: pmTwoUser } = await makeUser(`pm2-${stamp}@example.com`, "pm");
  const created = await makeAcceptedRequest(`rv-${stamp}@example.com`, excToken);
  await request(app).post(`/api/jobs/${created.id}/apply`).set("Authorization", `Bearer ${pmOne}`).send({});
  await request(app).post(`/api/jobs/${created.id}/apply`).set("Authorization", `Bearer ${pmTwo}`).send({});
  const apps = await request(app).get(`/api/jobs/${created.id}/applications`).set("Authorization", `Bearer ${excToken}`);
  const winner = apps.body.items.find((a) => a.user_id === pmOneUser.id).id;
  const loser = apps.body.items.find((a) => a.user_id === pmTwoUser.id).id;
  const dec = await request(app).post(`/api/jobs/applications/${winner}/decision`).set("Authorization", `Bearer ${excToken}`).send({ decision: "approve" });
  assert.equal(dec.status, 200);
  const rival = await pool.query("SELECT status FROM applications WHERE id = $1", [loser]);
  assert.equal(rival.rows[0].status, "REJECTED");
  const slots = await request(app).get(`/api/jobs/${created.id}/slots`).set("Authorization", `Bearer ${excToken}`);
  const pmSeat = slots.body.slots.find((s) => s.role === "pm");
  assert.equal(pmSeat.status, "FILLED");
  assert.equal(pmSeat.filled_by, pmOneUser.id);
  const repeat = await request(app).post(`/api/jobs/applications/${winner}/decision`).set("Authorization", `Bearer ${excToken}`).send({ decision: "approve" });
  assert.equal(repeat.status, 409);
  void pmTwoUser;
  await cleanupRequest(created.id, [`rv-${stamp}@example.com`]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});
