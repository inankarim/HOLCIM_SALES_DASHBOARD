-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(100) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Sales tables: one row per customer per upload_date.
--
-- Column names mirror the 6 real products exactly — PLC, PLC+,
-- Powercrete, PCC + OPC, HWP, HCG — each with 4 metrics:
--   *_target      — this month's target
--   *_mtd_sales   — cumulative sales so far this month
--   *_yesterday   — D-1 daily sales (the PRIMARY metric for the
--                   daily sales report — this is a daily report,
--                   uploaded date-wise, so this is what "today's
--                   report" actually means)
--   *_ach         — achievement % (as a fraction, e.g. 0.875 = 87.5%)
--
-- Storing all 4 per product (rather than just one number) is what
-- makes MTD/monthly/yearly progress and target-fulfillment views
-- possible later, since every upload's date is preserved.
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_current (
  id                    SERIAL PRIMARY KEY,
  upload_date           DATE NOT NULL,
  sap_id                INTEGER,
  customer_name         VARCHAR(255),
  customer_type         VARCHAR(100),
  region                VARCHAR(100),
  area                  VARCHAR(100),
  territory             VARCHAR(100),
  tsm_tse               VARCHAR(100),
  asm_kam               VARCHAR(100),
  rsm_b2b_head          VARCHAR(100),

  plc_target            NUMERIC(15,2),
  plc_mtd_sales         NUMERIC(15,2),
  plc_yesterday         NUMERIC(15,2),
  plc_ach               NUMERIC(7,4),

  plc_plus_target       NUMERIC(15,2),
  plc_plus_mtd_sales    NUMERIC(15,2),
  plc_plus_yesterday    NUMERIC(15,2),
  plc_plus_ach          NUMERIC(7,4),

  powercrete_target     NUMERIC(15,2),
  powercrete_mtd_sales  NUMERIC(15,2),
  powercrete_yesterday  NUMERIC(15,2),
  powercrete_ach        NUMERIC(7,4),

  pcc_opc_target        NUMERIC(15,2),
  pcc_opc_mtd_sales     NUMERIC(15,2),
  pcc_opc_yesterday     NUMERIC(15,2),
  pcc_opc_ach           NUMERIC(7,4),

  hwp_target            NUMERIC(15,2),
  hwp_mtd_sales         NUMERIC(15,2),
  hwp_yesterday         NUMERIC(15,2),
  hwp_ach               NUMERIC(7,4),

  hcg_target            NUMERIC(15,2),
  hcg_mtd_sales         NUMERIC(15,2),
  hcg_yesterday         NUMERIC(15,2),
  hcg_ach               NUMERIC(7,4),

  created_at            TIMESTAMP DEFAULT NOW()
);

-- Sales archived table (anything older than 4 months) — identical shape
CREATE TABLE IF NOT EXISTS sales_archived (
  id                    SERIAL PRIMARY KEY,
  upload_date           DATE NOT NULL,
  sap_id                INTEGER,
  customer_name         VARCHAR(255),
  customer_type         VARCHAR(100),
  region                VARCHAR(100),
  area                  VARCHAR(100),
  territory             VARCHAR(100),
  tsm_tse               VARCHAR(100),
  asm_kam               VARCHAR(100),
  rsm_b2b_head          VARCHAR(100),

  plc_target            NUMERIC(15,2),
  plc_mtd_sales         NUMERIC(15,2),
  plc_yesterday         NUMERIC(15,2),
  plc_ach               NUMERIC(7,4),

  plc_plus_target       NUMERIC(15,2),
  plc_plus_mtd_sales    NUMERIC(15,2),
  plc_plus_yesterday    NUMERIC(15,2),
  plc_plus_ach          NUMERIC(7,4),

  powercrete_target     NUMERIC(15,2),
  powercrete_mtd_sales  NUMERIC(15,2),
  powercrete_yesterday  NUMERIC(15,2),
  powercrete_ach        NUMERIC(7,4),

  pcc_opc_target        NUMERIC(15,2),
  pcc_opc_mtd_sales     NUMERIC(15,2),
  pcc_opc_yesterday     NUMERIC(15,2),
  pcc_opc_ach           NUMERIC(7,4),

  hwp_target            NUMERIC(15,2),
  hwp_mtd_sales         NUMERIC(15,2),
  hwp_yesterday         NUMERIC(15,2),
  hwp_ach               NUMERIC(7,4),

  hcg_target            NUMERIC(15,2),
  hcg_mtd_sales         NUMERIC(15,2),
  hcg_yesterday         NUMERIC(15,2),
  hcg_ach               NUMERIC(7,4),

  archived_at           TIMESTAMP DEFAULT NOW()
);

-- Index for faster date-based queries
CREATE INDEX IF NOT EXISTS idx_sales_current_date ON sales_current(upload_date);
CREATE INDEX IF NOT EXISTS idx_sales_current_sap ON sales_current(sap_id);
CREATE INDEX IF NOT EXISTS idx_sales_archived_date ON sales_archived(upload_date);

-- Add role column to existing users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- Constrain valid values
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE email_recipients (
  id SERIAL PRIMARY KEY,
  admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(254) NOT NULL,
  label VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(admin_user_id, email)
);

CREATE INDEX idx_email_recipients_admin ON email_recipients(admin_user_id);

-- ============================================================
-- Duplicate-row prevention for sales_current / sales_archived.
--
-- Root cause: the merge service (sales_summary_agent.py) previously
-- broadcast one combined-row's full totals onto every matching
-- sub-distributor row for a shared sap_id, inflating dashboard KPI
-- sums. That's now fixed at the merge-service level (values are split
-- evenly instead of copied), but nothing at the DB layer enforced this,
-- so this constraint adds defense-in-depth: it blocks a true accidental
-- duplicate row (same upload_date + sap_id + customer_name inserted
-- more than once), while still allowing legitimate multiple
-- sub-distributor rows that share a sap_id under different
-- customer_names.
--
-- IMPORTANT: run the duplicate-check query below FIRST and clean up
-- any existing duplicates (e.g. by re-running today's upload through
-- the fixed merge script) before this migration runs, or the
-- ALTER TABLE inside the DO block will fail with a duplicate-key error.
--
-- SELECT upload_date, sap_id, customer_name, COUNT(*)
-- FROM sales_current
-- GROUP BY upload_date, sap_id, customer_name
-- HAVING COUNT(*) > 1;
--
-- SELECT upload_date, sap_id, customer_name, COUNT(*)
-- FROM sales_archived
-- GROUP BY upload_date, sap_id, customer_name
-- HAVING COUNT(*) > 1;
--
-- Wrapped in DO blocks (rather than plain ALTER TABLE ... ADD CONSTRAINT)
-- so this file stays safe to re-run, matching the IF NOT EXISTS style
-- used everywhere else in this schema — Postgres has no
-- "ADD CONSTRAINT IF NOT EXISTS", so this is the idempotent equivalent.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_current_date_sap_name_unique'
  ) THEN
    ALTER TABLE sales_current
      ADD CONSTRAINT sales_current_date_sap_name_unique
      UNIQUE (upload_date, sap_id, customer_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_archived_date_sap_name_unique'
  ) THEN
    ALTER TABLE sales_archived
      ADD CONSTRAINT sales_archived_date_sap_name_unique
      UNIQUE (upload_date, sap_id, customer_name);
  END IF;
END $$;