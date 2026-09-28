import test from "node:test";
import assert from "node:assert/strict";
import { ackEmail } from "../src/lib/templates.js";

const KINDS = ["initial", "accepted", "rejected", "revision_accepted", "revision_rejected"];

test("every template carries token, track link, and safe titles", () => {
  for (const kind of KINDS) {
    const out = ackEmail({
      kind,
      projectTitle: 'Site <b>Redesign</b> "Alpha"',
      token: "11111111-2222-3333-4444-555555555555",
      trackUrl: "http://localhost:5173/track/11111111-2222-3333-4444-555555555555",
    });
    assert.ok(out.subject.length > 3, kind);
    assert.ok(out.html.includes("11111111-2222-3333-4444-555555555555"), kind);
    assert.ok(out.html.includes("http://localhost:5173/track/11111111-2222-3333-4444-555555555555"), kind);
    assert.ok(!out.html.includes("<b>Redesign</b>"), kind);
    assert.ok(out.html.includes("Site &lt;b&gt;Redesign&lt;/b&gt;"), kind);
    assert.ok(out.text.includes("11111111-2222-3333-4444-555555555555"), kind);
  }
});

test("unknown kind falls back to a generic notice", () => {
  const out = ackEmail({ kind: "mystery", projectTitle: "X", token: "t", trackUrl: "http://x" });
  assert.ok(out.subject.length > 0);
  assert.ok(out.html.includes("BCC Software House"));
});
