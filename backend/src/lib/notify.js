import { pool } from "../db.js";
import { sendMail } from "./mailer.js";

export async function logNotification({ recipient_email, recipient_user_id, type, payload }) {
  const res = await pool.query(
    "INSERT INTO notifications (recipient_email, recipient_user_id, type, payload) VALUES ($1, $2, $3, $4) RETURNING id",
    [recipient_email || null, recipient_user_id || null, type, JSON.stringify(payload || {})]
  );
  return res.rows[0].id;
}

export async function notifyAndSend({ recipient_email, recipient_user_id, type, payload, subject, html }) {
  const id = await logNotification({ recipient_email, recipient_user_id, type, payload });
  await sendMail({ to: recipient_email, subject: subject || type, html: html || "", notifId: id });
  return id;
}
