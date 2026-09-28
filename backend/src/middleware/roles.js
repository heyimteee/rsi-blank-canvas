import { pool } from "../db.js";

export function requireRole(...allowed) {
  return async (req, res, next) => {
    try {
      let role = req.user && req.user.role;
      if (!role) {
        const r = await pool.query("SELECT role FROM users WHERE id = $1", [req.user.id]);
        role = r.rows[0] && r.rows[0].role;
      }
      if (!role || !allowed.includes(role)) {
        return res.status(403).json({ message: "Forbidden: insufficient role" });
      }
      req.role = role;
      next();
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
