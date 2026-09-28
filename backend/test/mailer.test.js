import test from "node:test";
import assert from "node:assert/strict";
import { pool, initDb } from "../src/db.js";
import { sendMail, getDailySentCount, DAILY_CAP } from "../src/lib/mailer.js";
import { logNotification } from "../src/lib/notify.js";

test("disabled SMTP logs without sending", async () => {
  await initDb();
  delete process.env.SMTP_ENABLED;
  const id = await logNotification({
    recipient_email: "mailer-a@example.com",
    type: "INITIAL_ACK",
    payload: { title: "hello" },
  });
  const out = await sendMail({
    to: "mailer-a@example.com",
    subject: "Ack",
    html: "<p>hi</p>",
    notifId: id,
  });
  assert.equal(out.status, "logged");
  const row = await pool.query("SELECT email_status FROM notifications WHERE id = $1", [id]);
  assert.equal(row.rows[0].email_status, "logged");
  await pool.query("DELETE FROM notifications WHERE id = $1", [id]);
});

test("injected success transport marks sent", async () => {
  await initDb();
  const id = await logNotification({
    recipient_email: "mailer-b@example.com",
    type: "INITIAL_ACK",
    payload: {},
  });
  const fake = { sendMail: async () => ({ messageId: "m1" }) };
  const out = await sendMail(
    { to: "mailer-b@example.com", subject: "Hi", html: "<p>hi</p>", notifId: id },
    { transport: fake, skipCap: true }
  );
  assert.equal(out.status, "sent");
  const row = await pool.query("SELECT email_status FROM notifications WHERE id = $1", [id]);
  assert.equal(row.rows[0].email_status, "sent");
  await pool.query("DELETE FROM notifications WHERE id = $1", [id]);
});

test("injected failing transport marks failed without throwing", async () => {
  await initDb();
  const id = await logNotification({
    recipient_email: "mailer-c@example.com",
    type: "INITIAL_ACK",
    payload: {},
  });
  const fake = {
    sendMail: async () => {
      throw new Error("smtp down");
    },
  };
  const out = await sendMail(
    { to: "mailer-c@example.com", subject: "Hi", html: "<p>hi</p>", notifId: id },
    { transport: fake, skipCap: true }
  );
  assert.equal(out.status, "failed");
  const row = await pool.query("SELECT email_status FROM notifications WHERE id = $1", [id]);
  assert.equal(row.rows[0].email_status, "failed");
  await pool.query("DELETE FROM notifications WHERE id = $1", [id]);
});

test("daily cap guard returns capped", async () => {
  await initDb();
  const id = await logNotification({
    recipient_email: "mailer-d@example.com",
    type: "INITIAL_ACK",
    payload: {},
  });
  const fake = { sendMail: async () => ({ messageId: "m2" }) };
  const out = await sendMail(
    { to: "mailer-d@example.com", subject: "Hi", html: "<p>hi</p>", notifId: id },
    { transport: fake, countOverride: DAILY_CAP + 1 }
  );
  assert.equal(out.status, "capped");
  const row = await pool.query("SELECT email_status FROM notifications WHERE id = $1", [id]);
  assert.equal(row.rows[0].email_status, "capped");
  await pool.query("DELETE FROM notifications WHERE id = $1", [id]);
});

test("getDailySentCount returns a number", async () => {
  await initDb();
  const n = await getDailySentCount();
  assert.ok(Number.isInteger(n));
});
