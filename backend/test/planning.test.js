import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";
import { pool, initDb } from "../src/db.js";
import { requestTerms, revisionTerms } from "./support.js";

const iso = (daysFromNow) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

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

async function fillSeat(requestId, excToken, userToken, userId, role) {
  await request(app).post(`/api/jobs/${requestId}/apply`).set("Authorization", `Bearer ${userToken}`).send({});
  const apps = await request(app).get(`/api/jobs/${requestId}/applications`).set("Authorization", `Bearer ${excToken}`);
  const appId = apps.body.items.find((a) => a.user_id === userId).id;
  await request(app).post(`/api/jobs/applications/${appId}/decision`).set("Authorization", `Bearer ${excToken}`).send({ decision: "approve" });
  void role;
}

async function makeJob(stamp) {
  const { token: excToken } = await makeUser(`exc-${stamp}@example.com`, "exc");
  const { token: pmToken, user: pmUser } = await makeUser(`pm-${stamp}@example.com`, "pm");
  const { token: feToken, user: feUser } = await makeUser(`fe-${stamp}@example.com`, "fe");
  const created = await request(app).post("/api/requests").send({
    ...requestTerms(),
    client_name: "Plan Client",
    client_email: `plan-${stamp}@example.com`,
    title: "Plan project",
    details: "Planning core test details here",
  });
  const id = created.body.id;
  await request(app).post(`/api/requests/${id}/decision`).set("Authorization", `Bearer ${excToken}`).send({ decision: "accept" });
  await fillSeat(id, excToken, pmToken, pmUser.id, "pm");
  await fillSeat(id, excToken, feToken, feUser.id, "fe");
  return { id, excToken, pmToken, pmUser, feToken, feUser, clientEmail: `plan-${stamp}@example.com` };
}

async function cleanup(job, stamp) {
  await pool.query("DELETE FROM tasks WHERE milestone_id IN (SELECT id FROM milestones WHERE service_request_id = $1)", [job.id]);
  await pool.query("DELETE FROM milestones WHERE service_request_id = $1", [job.id]);
  await pool.query("DELETE FROM job_slots WHERE service_request_id = $1", [job.id]);
  await pool.query("DELETE FROM applications WHERE service_request_id = $1", [job.id]);
  await pool.query("DELETE FROM job_pool_posts WHERE service_request_id = $1", [job.id]);
  await pool.query("DELETE FROM service_requests WHERE id = $1", [job.id]);
  await pool.query("DELETE FROM notifications WHERE recipient_email = $1", [job.clientEmail]);
  await pool.query("DELETE FROM notifications WHERE payload->>'request_id' = $1", [String(job.id)]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%-${stamp}@example.com`]);
}

test("pm creates milestones and lists them with tasks grouped", async () => {
  const stamp = Date.now();
  const job = await makeJob(stamp);
  const denied = await request(app)
    .post(`/api/revisions/request/${job.id}/milestones`)
    .set("Authorization", `Bearer ${job.feToken}`)
    .send({ title: "Sprint 1" });
  assert.equal(denied.status, 403);
  const created = await request(app)
    .post(`/api/revisions/request/${job.id}/milestones`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Sprint 1", description: "Foundation work" });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "OPEN");
  assert.equal(created.body.description, "Foundation work");
  const bad = await request(app)
    .post(`/api/revisions/request/${job.id}/milestones`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "x" });
  assert.equal(bad.status, 400);
  const task = await request(app)
    .post(`/api/revisions/milestones/${created.body.id}/tasks`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Build hero section", assignee_id: job.feUser.id, deadline: iso(7), description: "Hero and nav" });
  assert.equal(task.status, 201);
  assert.equal(task.body.deadline.slice(0, 10), iso(7));
  const list = await request(app)
    .get(`/api/revisions/request/${job.id}/milestones`)
    .set("Authorization", `Bearer ${job.pmToken}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].tasks.length, 1);
  assert.equal(list.body.items[0].tasks[0].title, "Build hero section");
  await cleanup(job, stamp);
});

test("milestone done with open tasks warns, reopen works", async () => {
  const stamp = Date.now();
  const job = await makeJob(stamp);
  const ms = await request(app)
    .post(`/api/revisions/request/${job.id}/milestones`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Sprint 2" });
  const mid = ms.body.id;
  await request(app)
    .post(`/api/revisions/milestones/${mid}/tasks`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Write copy" });
  const done = await request(app)
    .put(`/api/revisions/milestones/${mid}`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ status: "DONE" });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, "DONE");
  assert.equal(done.body.warning, "Milestone marked done with open tasks");
  assert.equal(done.body.open_tasks, 1);
  const reopen = await request(app)
    .put(`/api/revisions/milestones/${mid}`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ status: "IN_PROGRESS" });
  assert.equal(reopen.status, 200);
  assert.equal(reopen.body.status, "IN_PROGRESS");
  assert.equal(reopen.body.warning, undefined);
  const rename = await request(app)
    .put(`/api/revisions/milestones/${mid}`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Sprint 2 revised", description: "Updated scope" });
  assert.equal(rename.status, 200);
  assert.equal(rename.body.title, "Sprint 2 revised");
  assert.equal(rename.body.description, "Updated scope");
  await cleanup(job, stamp);
});

test("task deadline validation and assignee seat rule", async () => {
  const stamp = Date.now();
  const job = await makeJob(stamp);
  const ms = await request(app)
    .post(`/api/revisions/request/${job.id}/milestones`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Sprint 3" });
  const mid = ms.body.id;
  const badDate = await request(app)
    .post(`/api/revisions/milestones/${mid}/tasks`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Bad date task", deadline: "not-a-date" });
  assert.equal(badDate.status, 400);
  const past = await request(app)
    .post(`/api/revisions/milestones/${mid}/tasks`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Past task", deadline: iso(-3) });
  assert.equal(past.status, 400);
  const outsider = await makeUser(`out-${stamp}@example.com`, "be");
  const badAssignee = await request(app)
    .post(`/api/revisions/milestones/${mid}/tasks`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Outsider task", assignee_id: outsider.user.id });
  assert.equal(badAssignee.status, 400);
  const ok = await request(app)
    .post(`/api/revisions/milestones/${mid}/tasks`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Valid task", assignee_id: job.feUser.id, deadline: iso(3) });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.status, "OPEN");
  await cleanup(job, stamp);
});

test("assignee moves own status only, pm edits and deletes", async () => {
  const stamp = Date.now();
  const job = await makeJob(stamp);
  const ms = await request(app)
    .post(`/api/revisions/request/${job.id}/milestones`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Sprint 4" });
  const mid = ms.body.id;
  const task = await request(app)
    .post(`/api/revisions/milestones/${mid}/tasks`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Implement login", assignee_id: job.feUser.id, deadline: iso(5) });
  const tid = task.body.id;
  const stranger = await makeUser(`str-${stamp}@example.com`, "be");
  const blocked = await request(app).put(`/api/revisions/tasks/${tid}`).set("Authorization", `Bearer ${stranger.token}`).send({ status: "DONE" });
  assert.equal(blocked.status, 403);
  const escalate = await request(app).put(`/api/revisions/tasks/${tid}`).set("Authorization", `Bearer ${job.feToken}`).send({ title: "Hijack" });
  assert.equal(escalate.status, 403);
  const moved = await request(app).put(`/api/revisions/tasks/${tid}`).set("Authorization", `Bearer ${job.feToken}`).send({ status: "DONE" });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.status, "DONE");
  const reopened = await request(app).put(`/api/revisions/tasks/${tid}`).set("Authorization", `Bearer ${job.feToken}`).send({ status: "IN_PROGRESS" });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.status, "IN_PROGRESS");
  const pmEdit = await request(app)
    .put(`/api/revisions/tasks/${tid}`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Implement login v2", deadline: iso(9), assignee_id: job.pmUser.id });
  assert.equal(pmEdit.status, 200);
  assert.equal(pmEdit.body.title, "Implement login v2");
  assert.equal(pmEdit.body.deadline.slice(0, 10), iso(9));
  const remove = await request(app).delete(`/api/revisions/tasks/${tid}`).set("Authorization", `Bearer ${job.pmToken}`);
  assert.equal(remove.status, 200);
  const gone = await pool.query("SELECT id FROM tasks WHERE id = $1", [tid]);
  assert.equal(gone.rows.length, 0);
  await cleanup(job, stamp);
});

test("milestone read is limited to job participants", async () => {
  const stamp = Date.now();
  const job = await makeJob(stamp);
  await request(app)
    .post(`/api/revisions/request/${job.id}/milestones`)
    .set("Authorization", `Bearer ${job.pmToken}`)
    .send({ title: "Sprint 5" });
  const outsider = await makeUser(`outsider-${stamp}@example.com`, "be");
  const denied = await request(app)
    .get(`/api/revisions/request/${job.id}/milestones`)
    .set("Authorization", `Bearer ${outsider.token}`);
  assert.equal(denied.status, 403);
  const member = await request(app)
    .get(`/api/revisions/request/${job.id}/milestones`)
    .set("Authorization", `Bearer ${job.feToken}`);
  assert.equal(member.status, 200);
  const exc = await request(app)
    .get(`/api/revisions/request/${job.id}/milestones`)
    .set("Authorization", `Bearer ${job.excToken}`);
  assert.equal(exc.status, 200);
  const noAuth = await request(app).get(`/api/revisions/request/${job.id}/milestones`);
  assert.equal(noAuth.status, 401);
  await cleanup(job, stamp);
});
