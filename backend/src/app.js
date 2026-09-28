import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import requestsRoutes from "./routes/requests.js";
import revisionsRoutes from "./routes/revisions.js";
import { requireAuth } from "./middleware/auth.js";

dotenv.config();

export const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/requests", requestsRoutes);
app.use("/api/revisions", revisionsRoutes);

app.get("/api/protected", requireAuth, (req, res) => {
  res.json({ message: "You are authorized", user: req.user });
});

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});
