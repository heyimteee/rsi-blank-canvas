import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";
import { pool, initDb } from "../src/db.js";
import { requestTerms, revisionTerms } from "./support.js";

async function makeUser(email, role) {
  await initDb();
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [email]);
  await pool.query("DELETE FROM service_requests WHERE client_email = $1", [email]);
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
  const r = await pool.query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role", [
    email,
    "hash",
    role,
  ]);
  const token = jwt.sign(
    { id: r.rows[0].id, email, role },
    process.env.JWT_SECRET || "test-secret-for-intake",
    { expiresIn: "1h" }
  );
  return { user: r.rows[0], token };
}

test("POST /api/requests creates request with acks logged", async () => {
  await initDb();
  const email = `intake-${Date.now()}@example.com`;
  const res = await request(app).post("/api/requests").send({
    ...requestTerms(),
    client_name: "Intake Client",
    client_email: email,
    title: "Company website",
    details: "Need a company profile website with contact form",
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.id);
  assert.ok(res.body.tracking_token);
  const rows = await pool.query("SELECT type FROM notifications WHERE recipient_email = $1", [email]);
  const types = rows.rows.map((r) => r.type);
  assert.ok(types.includes("INITIAL_ACK"));
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [email]);
  await pool.query("DELETE FROM job_pool_posts WHERE service_request_id = $1", [res.body.id]);
  await pool.query("DELETE FROM service_requests WHERE id = $1", [res.body.id]);
});

test("POST /api/requests rejects bad input", async () => {
  const badEmail = await request(app).post("/api/requests").send({
    ...requestTerms(),
    client_name: "A",
    client_email: "not-an-email",
    title: "T",
    details: "D",
  });
  assert.equal(badEmail.status, 400);
  const missing = await request(app).post("/api/requests").send({ client_name: "A" });
  assert.equal(missing.status, 400);
});

test("GET /api/requests/track/:token is public", async () => {
  const email = `track-${Date.now()}@example.com`;
  const created = await request(app).post("/api/requests").send({
    ...requestTerms(),
    client_name: "Track Client",
    client_email: email,
    title: "Track title",
    details: "Track details here",
  });
  const ok = await request(app).get(`/api/requests/track/${created.body.tracking_token}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.tracking_token, created.body.tracking_token);
  const miss = await request(app).get("/api/requests/track/00000000-0000-0000-0000-000000000000");
  assert.equal(miss.status, 404);
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [email]);
  await pool.query("DELETE FROM service_requests WHERE id = $1", [created.body.id]);
});

test("EXC decision accept opens job pool once only", async () => {
  const stamp = Date.now();
  const clientEmail = `decide-${stamp}@example.com`;
  const { token: excToken } = await makeUser(`exc-${stamp}@example.com`, "exc");
  const { token: memberToken } = await makeUser(`member-${stamp}@example.com`, "member");
  const created = await request(app).post("/api/requests").send({
    ...requestTerms(),
    client_name: "Decide Client",
    client_email: clientEmail,
    title: "Decide title",
    details: "Decide details here",
  });
  const id = created.body.id;
  const noAuth = await request(app).post(`/api/requests/${id}/decision`).send({ decision: "accept" });
  assert.equal(noAuth.status, 401);
  const forbidden = await request(app)
    .post(`/api/requests/${id}/decision`)
    .set("Authorization", `Bearer ${memberToken}`)
    .send({ decision: "accept" });
  assert.equal(forbidden.status, 403);
  const accept = await request(app)
    .post(`/api/requests/${id}/decision`)
    .set("Authorization", `Bearer ${excToken}`)
    .send({ decision: "accept", notes: "Good fit" });
  assert.equal(accept.status, 200);
  assert.equal(accept.body.status, "ACCEPTED");
  const poolRow = await pool.query("SELECT id FROM job_pool_posts WHERE service_request_id = $1", [id]);
  assert.equal(poolRow.rows.length, 1);
  const again = await request(app)
    .post(`/api/requests/${id}/decision`)
    .set("Authorization", `Bearer ${excToken}`)
    .send({ decision: "reject" });
  assert.equal(again.status, 409);
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [clientEmail]);
  await pool.query("DELETE FROM job_pool_posts WHERE service_request_id = $1", [id]);
  await pool.query("DELETE FROM service_requests WHERE id = $1", [id]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});

test("EXC decision reject notifies client", async () => {
  const stamp = Date.now();
  const clientEmail = `reject-${stamp}@example.com`;
  const { token: excToken } = await makeUser(`excr-${stamp}@example.com`, "exc");
  const created = await request(app).post("/api/requests").send({
    ...requestTerms(),
    client_name: "Reject Client",
    client_email: clientEmail,
    title: "Reject title",
    details: "Reject details here",
  });
  const id = created.body.id;
  const res = await request(app)
    .post(`/api/requests/${id}/decision`)
    .set("Authorization", `Bearer ${excToken}`)
    .send({ decision: "reject", notes: "Out of scope" });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "REJECTED");
  const rows = await pool.query("SELECT type FROM notifications WHERE recipient_email = $1", [clientEmail]);
  assert.ok(rows.rows.map((r) => r.type).includes("REJECTION_ACK"));
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [clientEmail]);
  await pool.query("DELETE FROM service_requests WHERE id = $1", [id]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
});
