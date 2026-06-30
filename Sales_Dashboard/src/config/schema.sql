-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(100) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Sales current table (last 4 months of daily uploads)
CREATE TABLE IF NOT EXISTS sales_current (
  id              SERIAL PRIMARY KEY,
  upload_date     DATE NOT NULL,
  sap_id          INTEGER,
  customer_name   VARCHAR(255),
  customer_type   VARCHAR(100),
  region          VARCHAR(100),
  area            VARCHAR(100),
  territory       VARCHAR(100),
  tsm_tse         VARCHAR(100),
  asm_kam         VARCHAR(100),
  rsm_b2b_head    VARCHAR(100),
  plc             NUMERIC(15,2),
  plc_plus        NUMERIC(15,2),
  pow             NUMERIC(15,2),
  holcim_ss       NUMERIC(15,2),
  hwp             NUMERIC(15,2),
  hcg             NUMERIC(15,2),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Sales archived table (anything older than 4 months)
CREATE TABLE IF NOT EXISTS sales_archived (
  id              SERIAL PRIMARY KEY,
  upload_date     DATE NOT NULL,
  sap_id          INTEGER,
  customer_name   VARCHAR(255),
  customer_type   VARCHAR(100),
  region          VARCHAR(100),
  area            VARCHAR(100),
  territory       VARCHAR(100),
  tsm_tse         VARCHAR(100),
  asm_kam         VARCHAR(100),
  rsm_b2b_head    VARCHAR(100),
  plc             NUMERIC(15,2),
  plc_plus        NUMERIC(15,2),
  pow             NUMERIC(15,2),
  holcim_ss       NUMERIC(15,2),
  hwp             NUMERIC(15,2),
  hcg             NUMERIC(15,2),
  archived_at     TIMESTAMP DEFAULT NOW()
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