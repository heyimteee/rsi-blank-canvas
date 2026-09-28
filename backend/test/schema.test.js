import test from "node:test";
import assert from "node:assert/strict";
import { pool, initDb } from "../src/db.js";

const TABLES = ["users", "service_requests", "job_pool_posts", "revisions", "milestones", "notifications"];

test("initDb is idempotent", async () => {
  await initDb();
  await initDb();
});

test("required tables exist", async () => {
  await initDb();
  const res = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  const names = res.rows.map((r) => r.table_name);
  for (const t of TABLES) {
    assert.ok(names.includes(t), `missing table ${t}`);
  }
});

test("users.role defaults to member and restricts values", async () => {
  await initDb();
  const email = `schema-test-${Date.now()}@example.com`;
  const inserted = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING role",
    [email, "x"]
  );
  assert.equal(inserted.rows[0].role, "member");
  await assert.rejects(
    pool.query("UPDATE users SET role = $1 WHERE email = $2", ["hacker", email])
  );
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
});

test("service_requests generates tracking_token by default", async () => {
  await initDb();
  const email = `client-${Date.now()}@example.com`;
  const res = await pool.query(
    "INSERT INTO service_requests (client_name, client_email, title, details) VALUES ($1, $2, $3, $4) RETURNING tracking_token, status",
    ["Test Client", email, "Test title", "Test details"]
  );
  assert.ok(res.rows[0].tracking_token);
  assert.equal(res.rows[0].status, "RECEIVED");
  await pool.query("DELETE FROM service_requests WHERE client_email = $1", [email]);
});

test("notifications email_status defaults to logged", async () => {
  await initDb();
  const res = await pool.query(
    "INSERT INTO notifications (recipient_email, type, payload) VALUES ($1, $2, $3) RETURNING email_status",
    ["a@example.com", "INITIAL_ACK", JSON.stringify({})]
  );
  assert.equal(res.rows[0].email_status, "logged");
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1 AND type = $2", [
    "a@example.com",
    "INITIAL_ACK",
  ]);
});
