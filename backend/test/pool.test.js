import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";
import { pool, initDb } from "../src/db.js";

async function loginAs(email) {
  const r = await pool.query("SELECT id, email, role FROM users WHERE email = $1", [email]);
  return jwt.sign({ id: r.rows[0].id, email, role: r.rows[0].role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

test("GET /api/requests/pool/open is visible to member without PII", async () => {
  await initDb();
  const stamp = Date.now();
  const clientEmail = `pool-${stamp}@example.com`;
  const created = await request(app).post("/api/requests").send({
    client_name: "Pool Client",
    client_email: clientEmail,
    title: "Pool project",
    details: "Details for pool visibility",
  });
  const id = created.body.id;
  const excToken = await loginAs("exc@bcc.local");
  await request(app).post(`/api/requests/${id}/decision`).set("Authorization", `Bearer ${excToken}`).send({ decision: "accept" });
  const devToken = await loginAs("fe@bcc.local");
  const res = await request(app).get("/api/requests/pool/open").set("Authorization", `Bearer ${devToken}`);
  assert.equal(res.status, 200);
  const found = res.body.items.find((x) => x.id === id);
  assert.ok(found);
  assert.ok(!("client_email" in found));
  const noAuth = await request(app).get("/api/requests/pool/open");
  assert.equal(noAuth.status, 401);
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [clientEmail]);
  await pool.query("DELETE FROM job_pool_posts WHERE service_request_id = $1", [id]);
  await pool.query("DELETE FROM service_requests WHERE id = $1", [id]);
});
