import nodemailer from "nodemailer";
import { pool } from "../db.js";

export const DAILY_CAP = 300;

export function isSmtpEnabled() {
  return (
    process.env.SMTP_ENABLED === "true" &&
    Boolean(process.env.SMTP_HOST) &&
    Boolean(process.env.SMTP_USER) &&
    Boolean(process.env.SMTP_PASS)
  );
}

export async function getDailySentCount() {
  const res = await pool.query(
    "SELECT COUNT(*)::int AS n FROM notifications WHERE sent_at::date = CURRENT_DATE AND email_status = 'sent'"
  );
  return res.rows[0].n;
}

async function markStatus(notifId, status) {
  if (!notifId) return;
  await pool.query("UPDATE notifications SET email_status = $1 WHERE id = $2", [status, notifId]);
}

function sender() {
  return process.env.MAIL_FROM || "BCC IS <noreply@example.com>";
}

export async function sendMail({ to, subject, html, notifId }, opts = {}) {
  try {
    if (!to) {
      await markStatus(notifId, "failed");
      return { status: "failed" };
    }
    if (opts.countOverride !== undefined) {
      if (opts.countOverride >= DAILY_CAP) {
        await markStatus(notifId, "capped");
        return { status: "capped" };
      }
    } else if (!opts.skipCap) {
      const n = await getDailySentCount();
      if (n >= DAILY_CAP) {
        await markStatus(notifId, "capped");
        return { status: "capped" };
      }
    }
    if (opts.transport) {
      await opts.transport.sendMail({ from: sender(), to, subject, html });
      await markStatus(notifId, "sent");
      return { status: "sent" };
    }
    if (!isSmtpEnabled()) {
      await markStatus(notifId, "logged");
      return { status: "logged" };
    }
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });
    await transport.sendMail({ from: sender(), to, subject, html });
    await markStatus(notifId, "sent");
    return { status: "sent" };
  } catch {
    try {
      await markStatus(notifId, "failed");
    } catch {
      return { status: "failed" };
    }
    return { status: "failed" };
  }
}
