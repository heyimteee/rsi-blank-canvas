import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn("[db] DATABASE_URL not set, using default postgres://postgres:postgres@localhost:5432/rsi_db");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/rsi_db",
});

export async function initDb() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "citext"`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT`);

  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
      END IF;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('exc', 'pm', 'fe', 'be', 'pd', 'member', 'admin'));
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_requests (
      id SERIAL PRIMARY KEY,
      tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      client_name TEXT NOT NULL,
      client_email CITEXT NOT NULL,
      client_org TEXT,
      title TEXT NOT NULL,
      details TEXT NOT NULL,
      budget_range TEXT,
      timeline TEXT,
      attachment_url TEXT,
      status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'ACK_SENT', 'PENDING_DECISION', 'ACCEPTED', 'REJECTED', 'JOB_POOL_OPEN')),
      decided_by INT REFERENCES users(id),
      decision_notes TEXT,
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_pool_posts (
      id SERIAL PRIMARY KEY,
      service_request_id INT UNIQUE NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      opened_at TIMESTAMPTZ DEFAULT NOW(),
      is_open BOOLEAN NOT NULL DEFAULT TRUE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS revisions (
      id SERIAL PRIMARY KEY,
      service_request_id INT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      client_email CITEXT NOT NULL,
      general_details TEXT NOT NULL,
      terms TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'NOTIFIED_PM', 'UNDER_REVIEW', 'REJECTED', 'SEPARATED', 'MILESTONES_UPDATED', 'LOGGED', 'ACCEPTED_NOTIFIED', 'REJECTED_NOTIFIED')),
      separated_concerns JSONB NOT NULL DEFAULT '[]',
      decided_by INT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS milestones (
      id SERIAL PRIMARY KEY,
      service_request_id INT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      revision_id INT REFERENCES revisions(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'DONE', 'REVISED')),
      sort_order INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      recipient_email CITEXT,
      recipient_user_id INT REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      read_at TIMESTAMPTZ,
      email_status TEXT NOT NULL DEFAULT 'logged' CHECK (email_status IN ('logged', 'sent', 'failed', 'capped'))
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_token ON service_requests(tracking_token)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_revisions_request ON revisions(service_request_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_revisions_status ON revisions(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_milestones_request ON milestones(service_request_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)`);

  console.log("[db] schema ready");
}
