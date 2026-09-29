import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";
import { pool, initDb } from "../src/db.js";
import { plusDays } from "./support.js";

const base = () => ({
  client_name: "Terms Client",
  client_email: `terms-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
  title: "Terms project",
  details: "Details for terms validation testing",
});

async function cleanupRequest(id, email) {
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [email]);
  await pool.query("DELETE FROM notifications WHERE payload->>'request_id' = $1", [String(id)]);
  await pool.query("DELETE FROM service_requests WHERE id = $1", [id]);
}

test("request requires amount, currency, and deadline", async () => {
  await initDb();
  const missingAmount = await request(app).post("/api/requests").send({ ...base(), budget_currency: "IDR", deadline: plusDays(10) });
  assert.equal(missingAmount.status, 400);
  const zero = await request(app)
    .post("/api/requests")
    .send({ ...base(), budget_amount: 0, budget_currency: "IDR", deadline: plusDays(10) });
  assert.equal(zero.status, 400);
  const badCurrency = await request(app)
    .post("/api/requests")
    .send({ ...base(), budget_amount: 1000, budget_currency: "EUR", deadline: plusDays(10) });
  assert.equal(badCurrency.status, 400);
  const noDeadline = await request(app)
    .post("/api/requests")
    .send({ ...base(), budget_amount: 1000, budget_currency: "USD" });
  assert.equal(noDeadline.status, 400);
  const pastDeadline = await request(app)
    .post("/api/requests")
    .send({ ...base(), budget_amount: 1000, budget_currency: "IDR", deadline: plusDays(-2) });
  assert.equal(pastDeadline.status, 400);
  const badDate = await request(app)
    .post("/api/requests")
    .send({ ...base(), budget_amount: 1000, budget_currency: "IDR", deadline: "soon" });
  assert.equal(badDate.status, 400);
});

test("request stores structured terms", async () => {
  await initDb();
  const payload = {
    ...base(),
    budget_amount: 12500000,
    budget_currency: "USD",
    deadline: plusDays(21),
    budget_range: "legacy text should not matter",
    timeline: "legacy timeline",
  };
  const res = await request(app).post("/api/requests").send(payload);
  assert.equal(res.status, 201);
  const row = await pool.query("SELECT budget_amount, budget_currency, deadline FROM service_requests WHERE id = $1", [res.body.id]);
  assert.equal(Number(row.rows[0].budget_amount), 12500000);
  assert.equal(row.rows[0].budget_currency, "USD");
  assert.equal(row.rows[0].deadline, plusDays(21));
  await cleanupRequest(res.body.id, payload.client_email);
});

test("revision requires delivery date and both amounts", async () => {
  await initDb();
  const created = await request(app)
    .post("/api/requests")
    .send({ ...base(), budget_amount: 5000000, budget_currency: "IDR", deadline: plusDays(30) });
  const id = created.body.id;
  const email = created.body ? (await pool.query("SELECT client_email FROM service_requests WHERE id = $1", [id])).rows[0].client_email : base().client_email;
  const noDate = await request(app).post("/api/revisions").send({
    service_request_id: id,
    client_email: email,
    general_details: "Adjust hero copy layout",
    new_budget_amount: 6000000,
    added_cost_amount: 1000000,
    budget_currency: "IDR",
  });
  assert.equal(noDate.status, 400);
  const noAdded = await request(app).post("/api/revisions").send({
    service_request_id: id,
    client_email: email,
    general_details: "Adjust hero copy layout",
    delivery_date: plusDays(10),
    new_budget_amount: 6000000,
    budget_currency: "IDR",
  });
  assert.equal(noAdded.status, 400);
  const pastDate = await request(app).post("/api/revisions").send({
    service_request_id: id,
    client_email: email,
    general_details: "Adjust hero copy layout",
    delivery_date: plusDays(-1),
    new_budget_amount: 6000000,
    added_cost_amount: 1000000,
    budget_currency: "IDR",
  });
  assert.equal(pastDate.status, 400);
  const ok = await request(app).post("/api/revisions").send({
    service_request_id: id,
    client_email: email,
    general_details: "Adjust hero copy layout",
    delivery_date: plusDays(10),
    new_budget_amount: 6000000,
    added_cost_amount: 1000000,
    budget_currency: "IDR",
  });
  assert.equal(ok.status, 201);
  const row = await pool.query(
    "SELECT delivery_date, new_budget_amount, added_cost_amount, budget_currency FROM revisions WHERE id = $1",
    [ok.body.id]
  );
  assert.equal(row.rows[0].delivery_date, plusDays(10));
  assert.equal(Number(row.rows[0].new_budget_amount), 6000000);
  assert.equal(Number(row.rows[0].added_cost_amount), 1000000);
  assert.equal(row.rows[0].budget_currency, "IDR");
  await pool.query("DELETE FROM revisions WHERE service_request_id = $1", [id]);
  await cleanupRequest(id, email);
});
