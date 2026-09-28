import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";
import { pool, initDb } from "../src/db.js";
import { seed } from "../scripts/seed.js";

test("seed is idempotent and creates demo roles", async () => {
  await initDb();
  await seed();
  await seed();
  const r = await pool.query("SELECT email, role FROM users WHERE email IN ('exc@bcc.local','pm@bcc.local','fe@bcc.local','be@bcc.local','pd@bcc.local') ORDER BY email");
  assert.equal(r.rows.length, 5);
  const map = Object.fromEntries(r.rows.map((x) => [x.email, x.role]));
  assert.equal(map["exc@bcc.local"], "exc");
  assert.equal(map["pm@bcc.local"], "pm");
  assert.equal(map["fe@bcc.local"], "fe");
  assert.equal(map["be@bcc.local"], "be");
  assert.equal(map["pd@bcc.local"], "pd");
  const gone = await pool.query("SELECT id FROM users WHERE email = 'dev@bcc.local'");
  assert.equal(gone.rows.length, 0);
});

test("auth responses include role and block escalation", async () => {
  await initDb();
  const email = `rbac-${Date.now()}@example.com`;
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
  const reg = await request(app).post("/api/auth/register").send({ email, password: "password123", role: "admin" });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.role, "member");
  const login = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, "member");
  const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, "member");
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
});

test("cross role access is forbidden", async () => {
  await seed();
  const excLogin = await request(app).post("/api/auth/login").send({ email: "exc@bcc.local", password: process.env.SEED_PASSWORD || "Password123" });
  const pmLogin = await request(app).post("/api/auth/login").send({ email: "pm@bcc.local", password: process.env.SEED_PASSWORD || "Password123" });
  const devLogin = await request(app).post("/api/auth/login").send({ email: "fe@bcc.local", password: process.env.SEED_PASSWORD || "Password123" });
  const devList = await request(app).get("/api/requests").set("Authorization", `Bearer ${devLogin.body.token}`);
  assert.equal(devList.status, 403);
  const excRev = await request(app).get("/api/revisions").set("Authorization", `Bearer ${excLogin.body.token}`);
  assert.equal(excRev.status, 403);
  const pmDecide = await request(app).post("/api/requests/1/decision").set("Authorization", `Bearer ${pmLogin.body.token}`).send({ decision: "accept" });
  assert.ok([403, 404].includes(pmDecide.status));
});
