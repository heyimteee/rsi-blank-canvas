import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { pool, initDb } from "../src/db.js";

dotenv.config();

const ACCOUNTS = [
  { email: "exc@bcc.local", role: "exc", full_name: "External Collaboration" },
  { email: "pm@bcc.local", role: "pm", full_name: "Project Manager" },
  { email: "fe@bcc.local", role: "fe", full_name: "Front End Developer" },
  { email: "be@bcc.local", role: "be", full_name: "Back End Developer" },
  { email: "pd@bcc.local", role: "pd", full_name: "Product Designer" },
];

const RETIRED = ["dev@bcc.local"];

export async function seed() {
  await initDb();
  const password = process.env.SEED_PASSWORD || "Password123";
  const hash = await bcrypt.hash(password, 10);
  for (const a of ACCOUNTS) {
    await pool.query(
      "INSERT INTO users (email, password_hash, role, full_name) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name",
      [a.email, hash, a.role, a.full_name]
    );
  }
  for (const email of RETIRED) {
    await pool.query("DELETE FROM users WHERE email = $1", [email]);
  }
  return ACCOUNTS.map((a) => a.email);
}

const direct = process.argv[1] && process.argv[1].endsWith("seed.js");
if (direct) {
  seed()
    .then((emails) => {
      console.log(`[seed] ready: ${emails.join(", ")}`);
      return pool.end();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[seed] failed:", err);
      process.exit(1);
    });
}
