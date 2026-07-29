
-- ============================================================
-- sales_targets
--
-- Monthly target file, loaded close to verbatim from the upload.
-- No sap_id / customer_name in the source file, so this is kept
-- at territory granularity, not customer granularity.
--
-- Two distinct row shapes coexist in this table:
--   customer_type = 'D2R'         -> brand is always 'Total'.
--                                    D2R has no per-product target,
--                                    only one combined number per
--                                    territory. Shown region-wise,
--                                    never broken out by brand.
--   customer_type = 'Distributor' -> brand is one of:
--                                    Holcim, HWP, HCG, Supercrete,
--                                    Supercrete Plus.
--                                    Joined to sales_current/
--                                    sales_archived product columns
--                                    via brand_product_map.
--
-- UNIQUE constraint doubles as upsert safety for monthly re-uploads.
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_targets (
  id             SERIAL PRIMARY KEY,
  target_month   DATE NOT NULL,        -- always stored as first-of-month, e.g. '2026-07-01'
  region         VARCHAR(100),
  area           VARCHAR(100),
  territory      VARCHAR(100),
  tsm_tse        VARCHAR(100),
  customer_type  VARCHAR(100) NOT NULL,   -- 'D2R' or 'Distributor'
  brand          VARCHAR(100) NOT NULL,   -- 'Total' for D2R; product brand name for Distributor
  target_value   NUMERIC(15,2),
  uploaded_at    TIMESTAMP DEFAULT NOW(),

  UNIQUE (target_month, region, area, territory, tsm_tse, customer_type, brand)
);

CREATE INDEX IF NOT EXISTS idx_sales_targets_lookup
  ON sales_targets(target_month, territory, tsm_tse, customer_type, brand);

CREATE INDEX IF NOT EXISTS idx_sales_targets_month
  ON sales_targets(target_month);

-- ============================================================
-- brand_product_map
--
-- Distributor-only. Maps the target file's brand label to the
-- product column prefix used in sales_current / sales_archived
-- (e.g. plc_mtd_sales, hwp_mtd_sales, ...).
--
-- powercrete and pcc_opc are intentionally NOT mapped here --
-- the target file does not track them for Distributor, so there
-- is no row for them. Treat their achievement as N/A in queries,
-- not as a target of 0 (see query notes below).
-- ============================================================

CREATE TABLE IF NOT EXISTS brand_product_map (
  brand           VARCHAR(100) PRIMARY KEY,
  product_prefix  VARCHAR(50) NOT NULL
);

INSERT INTO brand_product_map (brand, product_prefix) VALUES
  ('Holcim',           'pcc_opc'),
  ('HWP',               'hwp'),
  ('HCG',               'hcg'),
  ('Supercrete',        'plc'),
  ('Supercrete Plus',   'plc_plus'),
  ('Powercrete',        'powercrete')
ON CONFLICT (brand) DO NOTHING;
