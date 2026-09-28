import dotenv from "dotenv";
import { app } from "./app.js";
import { initDb, pool } from "./db.js";

dotenv.config();

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set. Set it in .env");
  process.exit(1);
}

async function start() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`[server] listening on http://localhost:${PORT}`);
      console.log(`[server] frontend allowed origin: ${FRONTEND_URL}`);
    });
  } catch (err) {
    console.error("[server] failed to init db:", err);
    process.exit(1);
  }
}

start();

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});
