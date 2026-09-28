function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const COPY = {
  initial: {
    subject: "We received your project request",
    heading: "Request received",
    intro: "Thanks for reaching out to BCC Software House. Your request is now in our review queue and External Collaboration will decide shortly.",
    next: "Save your tracking token below. You will get another email the moment we accept or reject the request.",
  },
  accepted: {
    subject: "Your project request was accepted",
    heading: "Request accepted",
    intro: "Good news. We accepted your project and opened it to our team pool. A project manager will coordinate the work from here.",
    next: "Track progress anytime with your token. If anything changes on your side, send a revision through the same portal.",
  },
  rejected: {
    subject: "Update on your project request",
    heading: "Request not accepted",
    intro: "Thanks for thinking of BCC Software House. We cannot take this project right now.",
    next: "You are welcome to submit a new request with adjusted scope or timing.",
  },
  revision_accepted: {
    subject: "Your revision was accepted",
    heading: "Revision accepted",
    intro: "We reviewed your revision and updated the project milestones. The team has been notified and work continues against the new plan.",
    next: "Track the latest state with your token. Send another revision if more changes come up.",
  },
  revision_rejected: {
    subject: "Update on your revision",
    heading: "Revision not accepted",
    intro: "We reviewed your revision and cannot fold it into the current plan.",
    next: "Reply with adjusted details through a new revision request and we will take another look.",
  },
};

export function trackUrlFor(token) {
  const base = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/track/${token}`;
}

export function ackEmail({ kind, projectTitle, token, trackUrl, note }) {
  const c = COPY[kind] || {
    subject: "Update from BCC Software House",
    heading: "Project update",
    intro: "There is an update on your project.",
    next: "Use your tracking token to follow along.",
  };
  const url = trackUrl || (token ? trackUrlFor(token) : null);
  const title = esc(projectTitle || "Your project");
  const lines = [
    `<p style="margin:0 0 12px 0;font-size:14px;line-height:22px;color:#3f3f46;">${esc(c.intro)}</p>`,
    `<p style="margin:0 0 4px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Project</p>`,
    `<p style="margin:0 0 16px 0;font-size:16px;font-weight:600;color:#18181b;">${title}</p>`,
  ];
  if (note) {
    lines.push(
      `<p style="margin:0 0 16px 0;font-size:14px;line-height:22px;color:#3f3f46;">${esc(note)}</p>`
    );
  }
  if (token) {
    lines.push(
      `<p style="margin:0 0 4px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Tracking token</p>`,
      `<p style="margin:0 0 16px 0;font-family:monospace;font-size:13px;color:#18181b;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;padding:10px 12px;">${esc(token)}</p>`
    );
  }
  if (url) {
    lines.push(
      `<p style="margin:0 0 16px 0;"><a href="${esc(url)}" style="display:inline-block;background:#18181b;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;padding:10px 18px;">Track your project</a></p>`
    );
  }
  lines.push(`<p style="margin:0;font-size:14px;line-height:22px;color:#3f3f46;">${esc(c.next)}</p>`);
  const html = [
    `<div style="background:#f4f4f5;padding:24px;font-family:Arial,Helvetica,sans-serif;">`,
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">`,
    `<div style="background:#18181b;padding:20px 24px;"><p style="margin:0;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa;">BCC Software House</p><p style="margin:4px 0 0 0;font-size:20px;font-weight:700;color:#ffffff;">${esc(c.heading)}</p></div>`,
    `<div style="padding:24px;">${lines.join("")}</div>`,
    `<div style="padding:16px 24px;border-top:1px solid #e4e4e7;"><p style="margin:0;font-size:12px;color:#71717a;">This is an automated message. Reply to this email if you need help.</p></div>`,
    `</div></div>`,
  ].join("");
  const text = [c.heading, "", c.intro, "", `Project: ${projectTitle || "Your project"}`];
  if (note) text.push("", note);
  if (token) text.push("", `Tracking token: ${token}`);
  if (url) text.push(`Track: ${url}`);
  text.push("", c.next);
  return { subject: c.subject, html, text: text.join("\n") };
}
