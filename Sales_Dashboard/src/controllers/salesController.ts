import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { pool } from "../config/db";

// ─── Helper: resolve date filter ─────────────────────────────────────────────
// If user passes ?date=YYYY-MM-DD → use that date
// If user passes ?start_date & ?end_date → use range
// Default → latest available date in sales_current

const PRODUCTS = [
  "plc_mtd_sales",
  "plc_plus_mtd_sales",
  "powercrete_mtd_sales",
  "pcc_opc_mtd_sales",
  "hwp_mtd_sales",
  "hcg_mtd_sales",
];

// ─── Helper: per-customer daily-sales aggregation (for general reports) ─────
// Every "sales figure" endpoint below (KPI, by-region, by-product, by-area,
// by-territory, customers, insights, deep-insights) reports actual sales
// volume — never the cumulative *_mtd_sales snapshot. Whether one date or a
// range is selected, we sum each day's *_yesterday delta (that's the true
// sales total for the period, single day or many) and take MAX(*_target)
// (the monthly target is constant across a range, so MAX just recovers that
// one value without multiplying it by the number of days selected).
//
// The result is still aliased as `${key}_mtd_sales` so the JSON response
// shape / field names stay unchanged for the frontend.
const PRODUCT_KEYS = ["plc", "plc_plus", "powercrete", "pcc_opc", "hwp", "hcg"];

function perCustomerProductCols(): string {
  return PRODUCT_KEYS.map((key) => {
    return `SUM(${key}_yesterday) AS ${key}_mtd_sales, MAX(${key}_target) AS ${key}_target`;
  }).join(",\n        ");
}

// Same idea, but for endpoints (like getCustomers) that already group by
// the exact customer identity in a single pass — no second aggregation
// level needed, just the daily-sales value column.
function productValueCols(): string {
  return PRODUCT_KEYS.map((key) => {
    return `SUM(${key}_yesterday) AS ${key}_mtd_sales`;
  }).join(",\n        ");
}

// ─── Helper: TRUE MTD snapshot aggregation (getMtdTargetByProduct ONLY) ─────
// This is the one place that's actually supposed to report cumulative MTD
// vs. target. It must only ever be queried against a single resolved date
// (see resolveMtdSnapshotFilter) — never summed across multiple upload
// dates, or it double-counts cumulative snapshots.
function perCustomerMtdSnapshotCols(): string {
  return PRODUCT_KEYS.map((key) => {
    return `SUM(${key}_mtd_sales) AS ${key}_mtd_sales, MAX(${key}_target) AS ${key}_target`;
  }).join(",\n        ");
}

async function resolveDateFilter(query: any): Promise<{
  clause: string;
  params: any[];
  mode: "single" | "range";
  defaultDate: string | null;
}> {
  const { date, start_date, end_date } = query;

  if (date) {
    return {
      clause: "WHERE upload_date = $1",
      params: [date],
      mode: "single",
      defaultDate: date,
    };
  }

  if (start_date && end_date) {
    return {
      clause: "WHERE upload_date BETWEEN $1 AND $2",
      params: [start_date, end_date],
      mode: "range",
      defaultDate: null,
    };
  }

  // Default: latest available date
  const latest = await pool.query(
    "SELECT MAX(upload_date)::text as latest FROM sales_current",
  );
  const latestDate = latest.rows[0]?.latest ?? null;

  if (!latestDate) {
    return {
      clause: "WHERE 1=0",
      params: [],
      mode: "single",
      defaultDate: null,
    };
  }

  return {
    clause: "WHERE upload_date = $1",
    params: [latestDate],
    mode: "single",
    defaultDate: latestDate,
  };
}

// ─── Helper: resolve the single snapshot date for TRUE MTD figures ──────────
// plc_mtd_sales / plc_target (and the other *_mtd_sales / *_target columns)
// are a cumulative-as-of-that-upload snapshot, refreshed on every upload.
// They must never be summed across dates (that adds several cumulative
// snapshots together) and, unlike the daily *_yesterday figures, a date
// range can't be handled by summing a delta either — there's no "delta"
// for a snapshot. So for genuine MTD reporting (e.g. MTD-vs-target), a
// selected range always collapses down to its latest upload date and reads
// that one snapshot directly, ignoring the rest of the range.
async function resolveMtdSnapshotFilter(
  query: any,
  base: {
    clause: string;
    params: any[];
    mode: "single" | "range";
    defaultDate: string | null;
  },
): Promise<{ clause: string; params: any[]; mtdDate: string | null }> {
  if (base.mode === "single") {
    return {
      clause: base.clause,
      params: base.params,
      mtdDate: base.defaultDate,
    };
  }

  const { start_date, end_date } = query;
  const latest = await pool.query(
    "SELECT MAX(upload_date)::text AS latest FROM sales_current WHERE upload_date BETWEEN $1 AND $2",
    [start_date, end_date],
  );
  const mtdDate = latest.rows[0]?.latest ?? null;

  if (!mtdDate) {
    return { clause: "WHERE 1=0", params: [], mtdDate: null };
  }

  return { clause: "WHERE upload_date = $1", params: [mtdDate], mtdDate };
}

// ─── Helper: build additional filters ────────────────────────────────────────
function buildFilters(
  query: any,
  existingParams: any[],
): { extra: string; params: any[] } {
  const filters: string[] = [];
  const params = [...existingParams];
  let idx = params.length + 1;

  if (query.region) {
    filters.push(`region = $${idx++}`);
    params.push(query.region);
  }
  if (query.area) {
    filters.push(`area = $${idx++}`);
    params.push(query.area);
  }
  if (query.territory) {
    filters.push(`territory = $${idx++}`);
    params.push(query.territory);
  }
  if (query.tsm_tse) {
    filters.push(`tsm_tse = $${idx++}`);
    params.push(query.tsm_tse);
  }
  if (query.asm_kam) {
    filters.push(`asm_kam = $${idx++}`);
    params.push(query.asm_kam);
  }
  if (query.rsm) {
    filters.push(`rsm_b2b_head = $${idx++}`);
    params.push(query.rsm);
  }
  if (query.customer) {
    filters.push(`customer_name ILIKE $${idx++}`);
    params.push(`%${query.customer}%`);
  }

  const extra = filters.length ? " AND " + filters.join(" AND ") : "";
  return { extra, params };
}
// filterOptions
export const getFilterOptions = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `SELECT
        ARRAY_AGG(DISTINCT region ORDER BY region)             AS regions,
        ARRAY_AGG(DISTINCT area ORDER BY area)                 AS areas,
        ARRAY_AGG(DISTINCT territory ORDER BY territory)       AS territories,
        ARRAY_AGG(DISTINCT tsm_tse ORDER BY tsm_tse)           AS tsm_tse,
        ARRAY_AGG(DISTINCT asm_kam ORDER BY asm_kam)           AS asm_kam,
        ARRAY_AGG(DISTINCT rsm_b2b_head ORDER BY rsm_b2b_head) AS rsm_b2b_head,
        ARRAY_AGG(DISTINCT customer_name ORDER BY customer_name) AS customers,
        COUNT(DISTINCT region)        AS total_regions,
        COUNT(DISTINCT area)          AS total_areas,
        COUNT(DISTINCT territory)     AS total_territories,
        COUNT(DISTINCT customer_name) AS total_customers
       FROM sales_current
       ${clause}${extra}`,
      allParams,
    );

    res.json({
      date_used: defaultDate,
      counts: {
        regions: Number(result.rows[0].total_regions),
        areas: Number(result.rows[0].total_areas),
        territories: Number(result.rows[0].total_territories),
        customers: Number(result.rows[0].total_customers),
      },
      options: {
        regions: result.rows[0].regions,
        areas: result.rows[0].areas,
        territories: result.rows[0].territories,
        tsm_tse: result.rows[0].tsm_tse,
        asm_kam: result.rows[0].asm_kam,
        rsm_b2b_head: result.rows[0].rsm_b2b_head,
        customers: result.rows[0].customers,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch filter options" });
  }
};

// ─── GET /api/sales/dates ─────────────────────────────────────────────────────
export const getAvailableDates = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const result = await pool.query(`
    SELECT DISTINCT upload_date::text AS upload_date
    FROM sales_current
    ORDER BY upload_date DESC
    `);
    res.json({
      dates: result.rows.map((r) => r.upload_date),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch dates" });
  }
};

// ─── GET /api/sales/kpi ───────────────────────────────────────────────────────
export const getKpi = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    // Collapse to one row per customer first — see perCustomerProductCols —
    // so a date range sums daily *_yesterday deltas (never *_mtd_sales) and
    // recovers the fixed monthly target once per customer via MAX, instead
    // of multiplying it by the number of days selected.
    const perCustomerCte = `
      per_customer AS (
        SELECT sap_id, customer_name, territory, region,
          ${perCustomerProductCols()}
        FROM sales_current
        ${clause}${extra}
        GROUP BY sap_id, customer_name, territory, region
      )`;

    const result = await pool.query(
      `WITH ${perCustomerCte}
       SELECT
        COALESCE(SUM(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales), 0) AS total_sales,
        COUNT(DISTINCT customer_name)                                    AS total_customers,
        COUNT(DISTINCT territory)                                        AS total_territories,
        COALESCE(AVG(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales), 0) AS avg_per_customer
       FROM per_customer`,
      allParams,
    );

    // Top & lowest region
    const regionResult = await pool.query(
      `WITH ${perCustomerCte}
       SELECT region,
        SUM(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales) AS total
       FROM per_customer
       GROUP BY region
       ORDER BY total DESC`,
      allParams,
    );

    // Top & lowest product
    const productResult = await pool.query(
      `WITH ${perCustomerCte}
       SELECT
        SUM(plc_mtd_sales)       AS plc_mtd_sales,
        SUM(plc_plus_mtd_sales)  AS plc_plus_mtd_sales,
        SUM(powercrete_mtd_sales)       AS powercrete_mtd_sales,
        SUM(pcc_opc_mtd_sales) AS pcc_opc_mtd_sales,
        SUM(hwp_mtd_sales)       AS hwp_mtd_sales,
        SUM(hcg_mtd_sales)       AS hcg_mtd_sales
       FROM per_customer`,
      allParams,
    );

    const regions = regionResult.rows;
    const products = productResult.rows[0];
    const productNameMap: Record<string, string> = {
      plc_mtd_sales: "PLC",
      plc_plus_mtd_sales: "PLC+",
      powercrete_mtd_sales: "Powercrete",
      pcc_opc_mtd_sales: "PCC + OPC",
      hwp_mtd_sales: "HWP",
      hcg_mtd_sales: "HCG",
    };

    const productEntries = Object.entries(products ?? {})
      .map(([k, v]) => [productNameMap[k] ?? k, v])
      .sort(([, a], [, b]) => Number(b) - Number(a));

    res.json({
      date_used: defaultDate,
      total_sales: Number(result.rows[0].total_sales),
      total_customers: Number(result.rows[0].total_customers),
      total_territories: Number(result.rows[0].total_territories),
      avg_per_customer: Number(result.rows[0].avg_per_customer),
      top_region: {
        name: regions[0]?.region ?? null,
        value: Number(regions[0]?.total ?? 0),
      },
      lowest_region: {
        name: regions[regions.length - 1]?.region ?? null,
        value: Number(regions[regions.length - 1]?.total ?? 0),
      },
      top_product: {
        name: productEntries[0]?.[0] ?? null,
        value: Number(productEntries[0]?.[1] ?? 0),
      },
      lowest_product: {
        name: productEntries[productEntries.length - 1]?.[0] ?? null,
        value: Number(productEntries[productEntries.length - 1]?.[1] ?? 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch KPI" });
  }
};

// ─── GET /api/sales/by-region ─────────────────────────────────────────────────
export const getByRegion = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `WITH per_customer AS (
        SELECT sap_id, region,
          ${perCustomerProductCols()}
        FROM sales_current
        ${clause}${extra}
        GROUP BY sap_id, region
      )
      SELECT
        region,
        SUM(plc_mtd_sales)                                            AS plc_mtd_sales,
        SUM(plc_plus_mtd_sales)                                       AS plc_plus_mtd_sales,
        SUM(powercrete_mtd_sales)                                            AS powercrete_mtd_sales,
        SUM(pcc_opc_mtd_sales)                                      AS pcc_opc_mtd_sales,
        SUM(hwp_mtd_sales)                                            AS hwp_mtd_sales,
        SUM(hcg_mtd_sales)                                            AS hcg_mtd_sales,
        SUM(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales)  AS total
       FROM per_customer
       GROUP BY region
       ORDER BY total DESC`,
      allParams,
    );

    res.json({
      date_used: defaultDate,
      data: result.rows.map((r) => ({
        region: r.region,
        plc_mtd_sales: Number(r.plc_mtd_sales),
        plc_plus_mtd_sales: Number(r.plc_plus_mtd_sales),
        powercrete_mtd_sales: Number(r.powercrete_mtd_sales),
        pcc_opc_mtd_sales: Number(r.pcc_opc_mtd_sales),
        hwp_mtd_sales: Number(r.hwp_mtd_sales),
        hcg_mtd_sales: Number(r.hcg_mtd_sales),
        total: Number(r.total),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch region data" });
  }
};

// ─── GET /api/sales/by-product ────────────────────────────────────────────────
export const getByProduct = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `WITH per_customer AS (
        SELECT sap_id,
          ${perCustomerProductCols()}
        FROM sales_current
        ${clause}${extra}
        GROUP BY sap_id
      )
      SELECT
        SUM(plc_mtd_sales)       AS plc_mtd_sales,
        SUM(plc_plus_mtd_sales)  AS plc_plus_mtd_sales,
        SUM(powercrete_mtd_sales)       AS powercrete_mtd_sales,
        SUM(pcc_opc_mtd_sales) AS pcc_opc_mtd_sales,
        SUM(hwp_mtd_sales)       AS hwp_mtd_sales,
        SUM(hcg_mtd_sales)       AS hcg_mtd_sales
       FROM per_customer`,
      allParams,
    );

    const row = result.rows[0];
    const total =
      Number(row.plc_mtd_sales) +
      Number(row.plc_plus_mtd_sales) +
      Number(row.powercrete_mtd_sales) +
      Number(row.pcc_opc_mtd_sales) +
      Number(row.hwp_mtd_sales) +
      Number(row.hcg_mtd_sales);

    const products = [
      { name: "PLC", value: Number(row.plc_mtd_sales) },
      { name: "PLC+", value: Number(row.plc_plus_mtd_sales) },
      { name: "Powercrete", value: Number(row.powercrete_mtd_sales) },
      { name: "PCC + OPC", value: Number(row.pcc_opc_mtd_sales) },
      { name: "HWP", value: Number(row.hwp_mtd_sales) },
      { name: "HCG", value: Number(row.hcg_mtd_sales) },
    ].sort((a, b) => b.value - a.value);

    res.json({
      date_used: defaultDate,
      total,
      data: products.map((p) => ({
        ...p,
        pct: total ? Number(((p.value / total) * 100).toFixed(2)) : 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product data" });
  }
};

// ─── GET /api/sales/mtd-target-by-product ─────────────────────────────────────
// Same MTD scope as getByProduct above, but paired with each product's target
// so the frontend can show achievement % without recomputing it client-side.
const mtdPctOf = (numerator: number, denominator: number): number =>
  denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;

export const getMtdTargetByProduct = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const dateFilter = await resolveDateFilter(req.query);
    // MTD-vs-target is a snapshot metric — see resolveMtdSnapshotFilter.
    // A selected range collapses to its latest upload date so we read one
    // true MTD snapshot instead of summing/blending cumulative values.
    const { clause, params, mtdDate } = await resolveMtdSnapshotFilter(
      req.query,
      dateFilter,
    );
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `WITH per_customer AS (
        SELECT sap_id,
          ${perCustomerMtdSnapshotCols()}
        FROM sales_current
        ${clause}${extra}
        GROUP BY sap_id
      )
      SELECT
        SUM(plc_mtd_sales) AS plc_mtd_sales, SUM(plc_target) AS plc_target,
        SUM(plc_plus_mtd_sales) AS plc_plus_mtd_sales, SUM(plc_plus_target) AS plc_plus_target,
        SUM(powercrete_mtd_sales) AS powercrete_mtd_sales, SUM(powercrete_target) AS powercrete_target,
        SUM(pcc_opc_mtd_sales) AS pcc_opc_mtd_sales, SUM(pcc_opc_target) AS pcc_opc_target,
        SUM(hwp_mtd_sales) AS hwp_mtd_sales, SUM(hwp_target) AS hwp_target,
        SUM(hcg_mtd_sales) AS hcg_mtd_sales, SUM(hcg_target) AS hcg_target
       FROM per_customer`,
      allParams,
    );

    const row = result.rows[0];
    const products = [
      {
        key: "plc",
        name: "PLC",
        mtd_sales: Number(row.plc_mtd_sales),
        target: Number(row.plc_target),
      },
      {
        key: "plc_plus",
        name: "PLC+",
        mtd_sales: Number(row.plc_plus_mtd_sales),
        target: Number(row.plc_plus_target),
      },
      {
        key: "powercrete",
        name: "Powercrete",
        mtd_sales: Number(row.powercrete_mtd_sales),
        target: Number(row.powercrete_target),
      },
      {
        key: "pcc_opc",
        name: "PCC + OPC",
        mtd_sales: Number(row.pcc_opc_mtd_sales),
        target: Number(row.pcc_opc_target),
      },
      {
        key: "hwp",
        name: "HWP",
        mtd_sales: Number(row.hwp_mtd_sales),
        target: Number(row.hwp_target),
      },
      {
        key: "hcg",
        name: "HCG",
        mtd_sales: Number(row.hcg_mtd_sales),
        target: Number(row.hcg_target),
      },
    ];

    const totalMtdSales = products.reduce((s, p) => s + p.mtd_sales, 0);
    const totalTarget = products.reduce((s, p) => s + p.target, 0);

    res.json({
      date_used: mtdDate,
      total_mtd_sales: totalMtdSales,
      total_target: totalTarget,
      overall_achievement_pct: mtdPctOf(totalMtdSales, totalTarget),
      // Worst achievement first — CEO's attention belongs on the laggards
      data: products
        .map((p) => ({
          ...p,
          achievement_pct: mtdPctOf(p.mtd_sales, p.target),
        }))
        .sort((a, b) => a.achievement_pct - b.achievement_pct),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch MTD target data" });
  }
};

// ─── GET /api/sales/region-product-heatmap ────────────────────────────────────
export const getRegionProductHeatmap = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `WITH per_customer AS (
        SELECT sap_id, region,
          ${perCustomerProductCols()}
        FROM sales_current
        ${clause}${extra}
        GROUP BY sap_id, region
      )
      SELECT
        region,
        SUM(plc_mtd_sales)       AS plc_mtd_sales,
        SUM(plc_plus_mtd_sales)  AS plc_plus_mtd_sales,
        SUM(powercrete_mtd_sales)       AS powercrete_mtd_sales,
        SUM(pcc_opc_mtd_sales) AS pcc_opc_mtd_sales,
        SUM(hwp_mtd_sales)       AS hwp_mtd_sales,
        SUM(hcg_mtd_sales)       AS hcg_mtd_sales,
        SUM(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales) AS total
       FROM per_customer
       GROUP BY region
       ORDER BY total DESC`,
      allParams,
    );

    res.json({
      date_used: defaultDate,
      data: result.rows.map((r) => ({
        region: r.region,
        plc_mtd_sales: Number(r.plc_mtd_sales),
        plc_plus_mtd_sales: Number(r.plc_plus_mtd_sales),
        powercrete_mtd_sales: Number(r.powercrete_mtd_sales),
        pcc_opc_mtd_sales: Number(r.pcc_opc_mtd_sales),
        hwp_mtd_sales: Number(r.hwp_mtd_sales),
        hcg_mtd_sales: Number(r.hcg_mtd_sales),
        total: Number(r.total),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch heatmap data" });
  }
};

// ─── GET /api/sales/by-area ───────────────────────────────────────────────────
export const getByArea = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `WITH per_customer AS (
        SELECT sap_id, area, region,
          ${perCustomerProductCols()}
        FROM sales_current
        ${clause}${extra}
        GROUP BY sap_id, area, region
      )
      SELECT
        area,
        region,
        SUM(plc_mtd_sales)       AS plc_mtd_sales,
        SUM(plc_plus_mtd_sales)  AS plc_plus_mtd_sales,
        SUM(powercrete_mtd_sales)       AS powercrete_mtd_sales,
        SUM(pcc_opc_mtd_sales) AS pcc_opc_mtd_sales,
        SUM(hwp_mtd_sales)       AS hwp_mtd_sales,
        SUM(hcg_mtd_sales)       AS hcg_mtd_sales,
        SUM(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales) AS total
       FROM per_customer
       GROUP BY area, region
       ORDER BY total DESC`,
      allParams,
    );

    res.json({
      date_used: defaultDate,
      data: result.rows.map((r) => ({
        area: r.area,
        region: r.region,
        plc_mtd_sales: Number(r.plc_mtd_sales),
        plc_plus_mtd_sales: Number(r.plc_plus_mtd_sales),
        powercrete_mtd_sales: Number(r.powercrete_mtd_sales),
        pcc_opc_mtd_sales: Number(r.pcc_opc_mtd_sales),
        hwp_mtd_sales: Number(r.hwp_mtd_sales),
        hcg_mtd_sales: Number(r.hcg_mtd_sales),
        total: Number(r.total),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch area data" });
  }
};

// ─── GET /api/sales/by-customer-type ──────────────────────────────────────────
export const getByCustomerType = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `WITH per_customer AS (
        SELECT sap_id, customer_type,
          ${perCustomerProductCols()}
        FROM sales_current
        ${clause}${extra}
        GROUP BY sap_id, customer_type
      )
      SELECT
        customer_type,
        SUM(plc_mtd_sales)       AS plc_mtd_sales,
        SUM(plc_plus_mtd_sales)  AS plc_plus_mtd_sales,
        SUM(powercrete_mtd_sales)       AS powercrete_mtd_sales,
        SUM(pcc_opc_mtd_sales) AS pcc_opc_mtd_sales,
        SUM(hwp_mtd_sales)       AS hwp_mtd_sales,
        SUM(hcg_mtd_sales)       AS hcg_mtd_sales,
        SUM(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales) AS total
       FROM per_customer
       WHERE customer_type IS NOT NULL AND customer_type != ''
       GROUP BY customer_type
       HAVING SUM(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales) > 0
       ORDER BY total DESC`,
      allParams,
    );

    const grandTotal = result.rows.reduce((s, r) => s + Number(r.total), 0);

    res.json({
      date_used: defaultDate,
      grand_total: grandTotal,
      // data.total gives chart #1 (total sales by customer type); the
      // per-product fields on the same rows give chart #2 (product mix by
      // customer type) — one endpoint serves both charts. Customer types
      // with a total of 0 are excluded via the HAVING clause above.
      data: result.rows.map((r) => ({
        customer_type: r.customer_type,
        plc_mtd_sales: Number(r.plc_mtd_sales),
        plc_plus_mtd_sales: Number(r.plc_plus_mtd_sales),
        powercrete_mtd_sales: Number(r.powercrete_mtd_sales),
        pcc_opc_mtd_sales: Number(r.pcc_opc_mtd_sales),
        hwp_mtd_sales: Number(r.hwp_mtd_sales),
        hcg_mtd_sales: Number(r.hcg_mtd_sales),
        total: Number(r.total),
        pct: grandTotal
          ? Number(((Number(r.total) / grandTotal) * 100).toFixed(2))
          : 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch customer type data" });
  }
};
// ─── GET /api/sales/by-territory ──────────────────────────────────────────────
export const getByTerritory = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `WITH per_customer AS (
        SELECT sap_id, territory, region, area,
          ${perCustomerProductCols()}
        FROM sales_current
        ${clause}${extra}
        GROUP BY sap_id, territory, region, area
      )
      SELECT
        territory,
        region,
        area,
        SUM(plc_mtd_sales)       AS plc_mtd_sales,
        SUM(plc_plus_mtd_sales)  AS plc_plus_mtd_sales,
        SUM(powercrete_mtd_sales)       AS powercrete_mtd_sales,
        SUM(pcc_opc_mtd_sales) AS pcc_opc_mtd_sales,
        SUM(hwp_mtd_sales)       AS hwp_mtd_sales,
        SUM(hcg_mtd_sales)       AS hcg_mtd_sales,
        SUM(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales) AS total
       FROM per_customer
       GROUP BY territory, region, area
       ORDER BY total DESC`,
      allParams,
    );

    res.json({
      date_used: defaultDate,
      data: result.rows.map((r) => ({
        territory: r.territory,
        region: r.region,
        area: r.area,
        plc_mtd_sales: Number(r.plc_mtd_sales),
        plc_plus_mtd_sales: Number(r.plc_plus_mtd_sales),
        powercrete_mtd_sales: Number(r.powercrete_mtd_sales),
        pcc_opc_mtd_sales: Number(r.pcc_opc_mtd_sales),
        hwp_mtd_sales: Number(r.hwp_mtd_sales),
        hcg_mtd_sales: Number(r.hcg_mtd_sales),
        total: Number(r.total),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch territory data" });
  }
};

// ─── GET /api/sales/customers ─────────────────────────────────────────────────
export const getCustomers = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `SELECT
        customer_name,
        region,
        area,
        territory,
        tsm_tse,
        asm_kam,
        rsm_b2b_head,
        ${productValueCols()},
        SUM(plc_yesterday + plc_plus_yesterday + powercrete_yesterday + pcc_opc_yesterday + hwp_yesterday + hcg_yesterday) AS total
       FROM sales_current
       ${clause}${extra}
       GROUP BY customer_name, region, area, territory, tsm_tse, asm_kam, rsm_b2b_head
       ORDER BY total DESC`,
      allParams,
    );

    const grandTotal = result.rows.reduce((s, r) => s + Number(r.total), 0);

    const customers = result.rows.map((r) => ({
      customer_name: r.customer_name,
      region: r.region,
      area: r.area,
      territory: r.territory,
      tsm_tse: r.tsm_tse,
      asm_kam: r.asm_kam,
      rsm_b2b_head: r.rsm_b2b_head,
      plc_mtd_sales: Number(r.plc_mtd_sales),
      plc_plus_mtd_sales: Number(r.plc_plus_mtd_sales),
      powercrete_mtd_sales: Number(r.powercrete_mtd_sales),
      pcc_opc_mtd_sales: Number(r.pcc_opc_mtd_sales),
      hwp_mtd_sales: Number(r.hwp_mtd_sales),
      hcg_mtd_sales: Number(r.hcg_mtd_sales),
      total: Number(r.total),
      pct_share: grandTotal
        ? Number(((Number(r.total) / grandTotal) * 100).toFixed(2))
        : 0,
    }));

    res.json({
      date_used: defaultDate,
      total_customers: customers.length,
      grand_total: grandTotal,
      top5: customers.slice(0, 5),
      // Exclude customers with 0 total sales from the bottom 5 — a
      // zero-sale customer isn't a "weak performer" for this list, it's a
      // non-buyer, and mixing them in crowds out customers who genuinely
      // sold a small (non-zero) amount.
      bottom5: customers
        .filter((c) => c.total !== 0)
        .slice(-5)
        .reverse(),
      data: customers,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch customer data" });
  }
};

// ─── GET /api/sales/insights ──────────────────────────────────────────────────
export const getInsights = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    // Always the true daily sales total — sum each day's *_yesterday delta,
    // whether one date or a range is selected. Never sum *_mtd_sales, which
    // is a cumulative snapshot and would overcount across multiple dates.
    const totalExpr =
      "plc_yesterday + plc_plus_yesterday + powercrete_yesterday + pcc_opc_yesterday + hwp_yesterday + hcg_yesterday";

    // Regions ranked
    const regionResult = await pool.query(
      `SELECT region,
        SUM(${totalExpr}) AS total
       FROM sales_current ${clause}${extra}
       GROUP BY region ORDER BY total DESC`,
      allParams,
    );

    // Territories ranked
    const territoryResult = await pool.query(
      `SELECT territory,
        SUM(${totalExpr}) AS total
       FROM sales_current ${clause}${extra}
       GROUP BY territory ORDER BY total DESC`,
      allParams,
    );

    // Customers ranked
    const customerResult = await pool.query(
      `SELECT customer_name,
        SUM(${totalExpr}) AS total
       FROM sales_current ${clause}${extra}
       GROUP BY customer_name ORDER BY total DESC`,
      allParams,
    );

    // Products total
    const productResult = await pool.query(
      `SELECT ${productValueCols()}
       FROM sales_current ${clause}${extra}`,
      allParams,
    );

    // Product dependency per top 3 regions
    const regions = regionResult.rows.slice(0, 3);
    const dependency = await Promise.all(
      regions.map(async (reg) => {
        const depParams = [...allParams, reg.region];

        const r = await pool.query(
          `SELECT ${productValueCols()}
           FROM sales_current
           ${clause}${extra} AND region = $${depParams.length}`,
          depParams,
        );
        const row = r.rows[0];
        const products = {
          PLC: Number(row.plc_mtd_sales),
          "PLC+": Number(row.plc_plus_mtd_sales),
          Powercrete: Number(row.powercrete_mtd_sales),
          "PCC + OPC": Number(row.pcc_opc_mtd_sales),
          HWP: Number(row.hwp_mtd_sales),
          HCG: Number(row.hcg_mtd_sales),
        };
        const topProduct = Object.entries(products).sort(
          ([, a], [, b]) => b - a,
        )[0];
        const regionTotal = Number(reg.total);
        const pct = regionTotal
          ? ((topProduct[1] / regionTotal) * 100).toFixed(0)
          : 0;
        return {
          region: reg.region,
          top_product: topProduct[0],
          pct,
          message: `${reg.region} relies on ${topProduct[0]} for ${pct}% of its sales.`,
        };
      }),
    );

    const pRow = productResult.rows[0];
    const productEntries = Object.entries({
      PLC: Number(pRow.plc_mtd_sales),
      "PLC+": Number(pRow.plc_plus_mtd_sales),
      Powercrete: Number(pRow.powercrete_mtd_sales),
      "PCC + OPC": Number(pRow.pcc_opc_mtd_sales),
      HWP: Number(pRow.hwp_mtd_sales),
      HCG: Number(pRow.hcg_mtd_sales),
    }).sort(([, a], [, b]) => b - a);

    const regions_list = regionResult.rows;
    const territories_list = territoryResult.rows;
    const customers_list = customerResult.rows;

    // Exclude customers with zero total sales when picking the lowest customer,
    // since a 0-total "lowest customer" isn't a meaningful insight.
    const nonZeroCustomers = customers_list.filter((c) => Number(c.total) > 0);
    const lowestCustomerRow =
      nonZeroCustomers.length > 0
        ? nonZeroCustomers[nonZeroCustomers.length - 1]
        : undefined;

    res.json({
      date_used: defaultDate,
      best_region: {
        name: regions_list[0]?.region,
        value: Number(regions_list[0]?.total ?? 0),
      },
      worst_region: {
        name: regions_list[regions_list.length - 1]?.region,
        value: Number(regions_list[regions_list.length - 1]?.total ?? 0),
      },
      weakest_territory: {
        name: territories_list[territories_list.length - 1]?.territory,
        value: Number(
          territories_list[territories_list.length - 1]?.total ?? 0,
        ),
      },
      top_customer: {
        name: customers_list[0]?.customer_name,
        value: Number(customers_list[0]?.total ?? 0),
      },
      lowest_customer: {
        name: lowestCustomerRow?.customer_name,
        value: Number(lowestCustomerRow?.total ?? 0),
      },
      most_sold_product: {
        name: productEntries[0]?.[0],
        value: productEntries[0]?.[1],
      },
      least_sold_product: {
        name: productEntries[productEntries.length - 1]?.[0],
        value: productEntries[productEntries.length - 1]?.[1],
      },
      product_dependency: dependency,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch insights" });
  }
};

//Get /api/sales/deep-insights -----------------------------

export const getDeepInsights = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    // Always the true daily sales total — sum each day's *_yesterday delta,
    // whether one date or a range is selected. Never sum *_mtd_sales, which
    // is a cumulative snapshot and would overcount across multiple dates.
    const totalExpr =
      "plc_yesterday + plc_plus_yesterday + powercrete_yesterday + pcc_opc_yesterday + hwp_yesterday + hcg_yesterday";
    // Same idea for a single product's column, e.g. "plc_yesterday".
    const productCol = (key: string) => `${key}_yesterday`;

    // ── 1. Bottom 5 TSM/TSE ──────────────────────────────────────────────────
    const bottomTsm = await pool.query(
      `SELECT tsm_tse,
        COUNT(DISTINCT customer_name) AS customers,
        SUM(${totalExpr}) AS total
       FROM sales_current ${clause}${extra}
       AND tsm_tse NOT ILIKE '%vacant%'
       AND tsm_tse != ''
       GROUP BY tsm_tse
       ORDER BY total ASC
       LIMIT 5`,
      allParams,
    );

    // ── 2. Bottom 5 ASM/KAM ──────────────────────────────────────────────────
    const bottomAsm = await pool.query(
      `SELECT asm_kam,
        COUNT(DISTINCT customer_name) AS customers,
        SUM(${totalExpr}) AS total
       FROM sales_current ${clause}${extra}
       AND asm_kam != ''
       GROUP BY asm_kam
       ORDER BY total ASC
       LIMIT 5`,
      allParams,
    );

    // ── 3. Bottom 5 RSM/B2B Head ─────────────────────────────────────────────
    const bottomRsm = await pool.query(
      `SELECT rsm_b2b_head,
        COUNT(DISTINCT customer_name) AS customers,
        SUM(${totalExpr}) AS total
       FROM sales_current ${clause}${extra}
       AND rsm_b2b_head != ''
       GROUP BY rsm_b2b_head
       ORDER BY total ASC
       LIMIT 5`,
      allParams,
    );

    // ── 4. Bottom 5 customers ─────────────────────────────────────────────────
    // Excludes customers with exactly 0 total sales — a non-buyer isn't a
    // "weak performer" for this list; we only want customers who sold a
    // genuinely small (but non-zero) amount.
    const bottomCustomers = await pool.query(
      `SELECT customer_name, region, area, territory, tsm_tse, asm_kam,
        SUM(${totalExpr}) AS total
       FROM sales_current ${clause}${extra}
       GROUP BY customer_name, region, area, territory, tsm_tse, asm_kam
       HAVING SUM(${totalExpr}) != 0
       ORDER BY total ASC
       LIMIT 5`,
      allParams,
    );

    // ── 5. Bottom 5 territories ───────────────────────────────────────────────
    const bottomTerritories = await pool.query(
      `SELECT territory, region, area,
        COUNT(DISTINCT customer_name) AS customers,
        SUM(${totalExpr}) AS total
       FROM sales_current ${clause}${extra}
       GROUP BY territory, region, area
       ORDER BY total ASC
       LIMIT 5`,
      allParams,
    );

    // ── 1b. Top 5 TSM/TSE ──────────────────────────────────────────────────
    const topTsm = await pool.query(
      `SELECT tsm_tse,
        COUNT(DISTINCT customer_name) AS customers,
        SUM(${totalExpr}) AS total
      FROM sales_current ${clause}${extra}
      AND tsm_tse NOT ILIKE '%vacant%'
      AND tsm_tse != ''
      GROUP BY tsm_tse
      ORDER BY total DESC
      LIMIT 5`,
      allParams,
    );

    // ── 2b. Top 5 ASM/KAM ──────────────────────────────────────────────────
    const topAsm = await pool.query(
      `SELECT asm_kam,
        COUNT(DISTINCT customer_name) AS customers,
        SUM(${totalExpr}) AS total
      FROM sales_current ${clause}${extra}
      AND asm_kam != ''
      GROUP BY asm_kam
      ORDER BY total DESC
      LIMIT 5`,
      allParams,
    );

    // ── 3b. Top 5 RSM/B2B Head ─────────────────────────────────────────────
    const topRsm = await pool.query(
      `SELECT rsm_b2b_head,
        COUNT(DISTINCT customer_name) AS customers,
        SUM(${totalExpr}) AS total
      FROM sales_current ${clause}${extra}
      AND rsm_b2b_head != ''
      GROUP BY rsm_b2b_head
      ORDER BY total DESC
      LIMIT 5`,
      allParams,
    );

    // ── 4b. Top 5 customers ─────────────────────────────────────────────────
    const topCustomers = await pool.query(
      `SELECT customer_name, region, area, territory, tsm_tse, asm_kam,
        SUM(${totalExpr}) AS total
      FROM sales_current ${clause}${extra}
      GROUP BY customer_name, region, area, territory, tsm_tse, asm_kam
      ORDER BY total DESC
      LIMIT 5`,
      allParams,
    );

    // ── 5b. Top 5 territories ───────────────────────────────────────────────
    const topTerritories = await pool.query(
      `SELECT territory, region, area,
        COUNT(DISTINCT customer_name) AS customers,
        SUM(${totalExpr}) AS total
      FROM sales_current ${clause}${extra}
      GROUP BY territory, region, area
      ORDER BY total DESC
      LIMIT 5`,
      allParams,
    );

    // ── 6. Vacant TSM/TSE territories ────────────────────────────────────────
    const vacantTsm = await pool.query(
      `SELECT territory, region, area,
        COUNT(DISTINCT customer_name) AS customers,
        SUM(${totalExpr}) AS total
       FROM sales_current ${clause}${extra}
       AND tsm_tse ILIKE '%vacant%'
       GROUP BY territory, region, area
       ORDER BY total DESC`,
      allParams,
    );

    // ── 7. Zero/low sales customers (bottom 10%) ──────────────────────────────
    const avgResult = await pool.query(
      `SELECT AVG(${totalExpr}) AS avg
       FROM sales_current ${clause}${extra}`,
      allParams,
    );
    const avgSales = Number(avgResult.rows[0]?.avg ?? 0);
    const threshold = avgSales * 0.1; // bottom 10% of average

    const lowSalesCustomers = await pool.query(
      `SELECT customer_name, region, area, territory, tsm_tse,
        SUM(${totalExpr}) AS total
       FROM sales_current ${clause}${extra}
       GROUP BY customer_name, region, area, territory, tsm_tse
       HAVING SUM(${totalExpr}) <= $${allParams.length + 1}
       ORDER BY total ASC
       LIMIT 20`,
      [...allParams, threshold],
    );

    // ── 8. Single product customers (upsell opportunity) ─────────────────────
    const productBuyingCase = PRODUCT_KEYS.map(
      (key) => `CASE WHEN SUM(${productCol(key)}) > 0 THEN 1 ELSE 0 END`,
    ).join(" +\n         ");

    const singleProductCustomers = await pool.query(
      `SELECT customer_name, region, area, territory, tsm_tse,
        SUM(${totalExpr}) AS total,
        (${productBuyingCase}) AS products_buying
       FROM sales_current ${clause}${extra}
       GROUP BY customer_name, region, area, territory, tsm_tse
       HAVING (${productBuyingCase}) = 1
       ORDER BY total DESC
       LIMIT 20`,
      allParams,
    );

    // ── 9. Customer concentration risk ───────────────────────────────────────
    const concentrationResult = await pool.query(
      `WITH ranked AS (
        SELECT customer_name,
          SUM(${totalExpr}) AS total
        FROM sales_current ${clause}${extra}
        GROUP BY customer_name
        ORDER BY total DESC
      ),
      totals AS (
        SELECT SUM(total) AS grand_total FROM ranked
      )
      SELECT
        SUM(CASE WHEN rn <= 5  THEN total ELSE 0 END) AS top5_total,
        SUM(CASE WHEN rn <= 10 THEN total ELSE 0 END) AS top10_total,
        SUM(CASE WHEN rn <= 20 THEN total ELSE 0 END) AS top20_total,
        MAX(grand_total) AS grand_total
      FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY total DESC) AS rn FROM ranked) r
      CROSS JOIN totals`,
      allParams,
    );

    const conc = concentrationResult.rows[0];
    const grandTotal = Number(conc.grand_total ?? 0);

    // ── 10. Product concentration risk ───────────────────────────────────────
    const productResult = await pool.query(
      `SELECT ${productValueCols()},
        SUM(${totalExpr}) AS total
       FROM sales_current ${clause}${extra}`,
      allParams,
    );

    const pRow = productResult.rows[0];
    const totalSales = Number(pRow.total ?? 0);
    const productConcentration = [
      { name: "PLC", value: Number(pRow.plc_mtd_sales) },
      { name: "PLC+", value: Number(pRow.plc_plus_mtd_sales) },
      { name: "Powercrete", value: Number(pRow.powercrete_mtd_sales) },
      { name: "PCC + OPC", value: Number(pRow.pcc_opc_mtd_sales) },
      { name: "HWP", value: Number(pRow.hwp_mtd_sales) },
      { name: "HCG", value: Number(pRow.hcg_mtd_sales) },
    ]
      .sort((a, b) => b.value - a.value)
      .map((p) => ({
        ...p,
        pct: totalSales ? Number(((p.value / totalSales) * 100).toFixed(2)) : 0,
        impact_if_dropped_20pct: Number((p.value * 0.2).toFixed(0)),
      }));

    // ── 11. TSM/TSE efficiency (revenue per TSM) ─────────────────────────────
    const tsmEfficiency = await pool.query(
      `SELECT tsm_tse,
        COUNT(DISTINCT customer_name) AS customers,
        COUNT(DISTINCT territory)     AS territories,
        SUM(${totalExpr}) AS total,
        AVG(${totalExpr}) AS avg_per_customer
       FROM sales_current ${clause}${extra}
       AND tsm_tse NOT ILIKE '%vacant%'
       AND tsm_tse != ''
       GROUP BY tsm_tse
       ORDER BY total DESC`,
      allParams,
    );
    // ── TSM/TSE top and bottom customer ──────────────────────────────────────
    const tsmCustomerStats = await pool.query(
      `WITH customer_totals AS (
        SELECT tsm_tse, customer_name,
          SUM(${totalExpr}) AS total
        FROM sales_current ${clause}${extra}
        AND tsm_tse NOT ILIKE '%vacant%'
        AND tsm_tse != ''
        GROUP BY tsm_tse, customer_name
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY tsm_tse ORDER BY total DESC) AS rn_top,
          ROW_NUMBER() OVER (PARTITION BY tsm_tse ORDER BY total ASC)  AS rn_bottom
        FROM customer_totals
      )
      SELECT
        tsm_tse,
        MAX(CASE WHEN rn_top    = 1 THEN customer_name END) AS top_customer,
        MAX(CASE WHEN rn_top    = 1 THEN total         END) AS top_customer_total,
        MAX(CASE WHEN rn_bottom = 1 THEN customer_name END) AS bottom_customer,
        MAX(CASE WHEN rn_bottom = 1 THEN total         END) AS bottom_customer_total
      FROM ranked
      GROUP BY tsm_tse`,
      allParams,
    );
    // ── 12. Region concentration risk ────────────────────────────────────────
    const regionResult = await pool.query(
      `SELECT region,
        SUM(${totalExpr}) AS total
       FROM sales_current ${clause}${extra}
       GROUP BY region
       ORDER BY total DESC`,
      allParams,
    );

    const regionConcentration = regionResult.rows.map((r) => ({
      region: r.region,
      total: Number(r.total),
      pct: totalSales
        ? Number(((Number(r.total) / totalSales) * 100).toFixed(2))
        : 0,
    }));

    // ── 13. Below average territories ────────────────────────────────────────
    const belowAvgTerritories = await pool.query(
      `WITH territory_totals AS (
        SELECT territory, region, area,
          COUNT(DISTINCT customer_name) AS customers,
          SUM(${totalExpr}) AS total
        FROM sales_current ${clause}${extra}
        GROUP BY territory, region, area
      ),
      avg_calc AS (
        SELECT AVG(total) AS avg_total FROM territory_totals
      )
      SELECT t.*, a.avg_total,
        ROUND(((t.total - a.avg_total) / a.avg_total * 100)::numeric, 2) AS pct_below_avg
      FROM territory_totals t
      CROSS JOIN avg_calc a
      WHERE t.total < a.avg_total
      ORDER BY t.total ASC`,
      allParams,
    );

    // ── Final response ────────────────────────────────────────────────────────
    res.json({
      date_used: defaultDate,

      failures: {
        bottom5_tsm_tse: bottomTsm.rows.map((r) => ({
          tsm_tse: r.tsm_tse,
          customers: Number(r.customers),
          total: Number(r.total),
        })),
        bottom5_asm_kam: bottomAsm.rows.map((r) => ({
          asm_kam: r.asm_kam,
          customers: Number(r.customers),
          total: Number(r.total),
        })),
        bottom5_rsm: bottomRsm.rows.map((r) => ({
          rsm_b2b_head: r.rsm_b2b_head,
          customers: Number(r.customers),
          total: Number(r.total),
        })),
        bottom5_customers: bottomCustomers.rows.map((r) => ({
          customer_name: r.customer_name,
          region: r.region,
          area: r.area,
          territory: r.territory,
          tsm_tse: r.tsm_tse,
          asm_kam: r.asm_kam,
          total: Number(r.total),
        })),
        bottom5_territories: bottomTerritories.rows.map((r) => ({
          territory: r.territory,
          region: r.region,
          area: r.area,
          customers: Number(r.customers),
          total: Number(r.total),
        })),
        vacant_tsm_territories: {
          count: vacantTsm.rows.length,
          data: vacantTsm.rows.map((r) => ({
            territory: r.territory,
            region: r.region,
            area: r.area,
            customers: Number(r.customers),
            total: Number(r.total),
          })),
        },
        low_sales_customers: {
          threshold: Number(threshold.toFixed(0)),
          avg_sales: Number(avgSales.toFixed(0)),
          count: lowSalesCustomers.rows.length,
          data: lowSalesCustomers.rows.map((r) => ({
            customer_name: r.customer_name,
            region: r.region,
            area: r.area,
            territory: r.territory,
            tsm_tse: r.tsm_tse,
            total: Number(r.total),
          })),
        },
      },

      // ── ADD THIS BLOCK RIGHT HERE ─────────────────────────────────────────
      performers: {
        top5_tsm_tse: topTsm.rows.map((r) => ({
          tsm_tse: r.tsm_tse,
          customers: Number(r.customers),
          total: Number(r.total),
        })),
        top5_asm_kam: topAsm.rows.map((r) => ({
          asm_kam: r.asm_kam,
          customers: Number(r.customers),
          total: Number(r.total),
        })),
        top5_rsm: topRsm.rows.map((r) => ({
          rsm_b2b_head: r.rsm_b2b_head,
          customers: Number(r.customers),
          total: Number(r.total),
        })),
        top5_customers: topCustomers.rows.map((r) => ({
          customer_name: r.customer_name,
          region: r.region,
          area: r.area,
          territory: r.territory,
          tsm_tse: r.tsm_tse,
          asm_kam: r.asm_kam,
          total: Number(r.total),
        })),
        top5_territories: topTerritories.rows.map((r) => ({
          territory: r.territory,
          region: r.region,
          area: r.area,
          customers: Number(r.customers),
          total: Number(r.total),
        })),
      },
      // ── END OF PERFORMERS BLOCK ───────────────────────────────────────────

      opportunities: {
        single_product_customers: {
          count: singleProductCustomers.rows.length,
          message: `${singleProductCustomers.rows.length} customers are buying only 1 product — upsell opportunity`,
          data: singleProductCustomers.rows.map((r) => ({
            customer_name: r.customer_name,
            region: r.region,
            area: r.area,
            territory: r.territory,
            tsm_tse: r.tsm_tse,
            products_buying: Number(r.products_buying),
            total: Number(r.total),
          })),
        },
        below_avg_territories: {
          count: belowAvgTerritories.rows.length,
          data: belowAvgTerritories.rows.map((r) => ({
            territory: r.territory,
            region: r.region,
            area: r.area,
            customers: Number(r.customers),
            total: Number(r.total),
            avg_total: Number(r.avg_total),
            pct_below_avg: Number(r.pct_below_avg),
          })),
        },
      },

      risks: {
        customer_concentration: {
          top5_pct: grandTotal
            ? Number(((Number(conc.top5_total) / grandTotal) * 100).toFixed(2))
            : 0,
          top10_pct: grandTotal
            ? Number(((Number(conc.top10_total) / grandTotal) * 100).toFixed(2))
            : 0,
          top20_pct: grandTotal
            ? Number(((Number(conc.top20_total) / grandTotal) * 100).toFixed(2))
            : 0,
          message: `Top 10 customers contribute ${grandTotal ? ((Number(conc.top10_total) / grandTotal) * 100).toFixed(1) : 0}% of total revenue`,
        },
        product_concentration: productConcentration,
        region_concentration: regionConcentration,
      },

      efficiency: {
        tsm_tse: tsmEfficiency.rows.map((r) => {
          const stats = tsmCustomerStats.rows.find(
            (s) => s.tsm_tse === r.tsm_tse,
          );
          return {
            tsm_tse: r.tsm_tse,
            customers: Number(r.customers),
            territories: Number(r.territories),
            total: Number(r.total),
            avg_per_customer: Number(Number(r.avg_per_customer).toFixed(0)),
            top_customer: stats?.top_customer ?? "—",
            top_customer_total: Number(stats?.top_customer_total ?? 0),
            bottom_customer: stats?.bottom_customer ?? "—",
            bottom_customer_total: Number(stats?.bottom_customer_total ?? 0),
          };
        }),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch deep insights" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// D-1 DAILY REPORT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════
// Everything below reads the *_yesterday, *_target, and *_ach columns added
// by migration_002. Yesterday Sales is the PRIMARY metric for these — this
// is the actual daily sales report, distinct from the MTD-cumulative view
// the endpoints above provide.
//
// Reuses the exact same resolveDateFilter/buildFilters helpers as the rest
// of this file: each upload's *_yesterday columns already represent that
// upload's D-1 sales, so "latest upload_date" (the existing default) is
// still the right default here — no new date-resolution logic needed.

const YESTERDAY_SUM_EXPR =
  "(plc_yesterday + plc_plus_yesterday + powercrete_yesterday + pcc_opc_yesterday + hwp_yesterday + hcg_yesterday)";
const TARGET_SUM_EXPR =
  "(plc_target + plc_plus_target + powercrete_target + pcc_opc_target + hwp_target + hcg_target)";

const YESTERDAY_PRODUCT_NAME_MAP: Record<string, string> = {
  plc_yesterday: "PLC",
  plc_plus_yesterday: "PLC+",
  powercrete_yesterday: "Powercrete",
  pcc_opc_yesterday: "PCC + OPC",
  hwp_yesterday: "HWP",
  hcg_yesterday: "HCG",
};

const pctOf = (numerator: number, denominator: number): number =>
  denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;

// Target is a fixed monthly value re-uploaded every day. When grouping
// across multiple customers (by region/territory/product/overall), we must
// collapse to one row per customer first — MAX recovers the constant value
// per customer — before summing across customers. Otherwise a date range
// multiplies the target by however many days are in it.
function perCustomerTargetCols(): string {
  return PRODUCT_KEYS.map((key) => `MAX(${key}_target) AS ${key}_target`).join(
    ", ",
  );
}

// ─── GET /api/sales/yesterday/kpi ─────────────────────────────────────────────
export const getYesterdayKpi = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `SELECT
        COALESCE(SUM(${YESTERDAY_SUM_EXPR}), 0) AS total_yesterday,
        COUNT(DISTINCT customer_name)             AS total_customers,
        COUNT(DISTINCT territory)                 AS total_territories,
        COALESCE(AVG(${YESTERDAY_SUM_EXPR}), 0) AS avg_per_customer
       FROM sales_current
       ${clause}${extra}`,
      allParams,
    );

    // See perCustomerTargetCols — collapse to one row per customer before
    // summing the fixed monthly target across customers.
    const targetResult = await pool.query(
      `WITH per_customer AS (
        SELECT sap_id, ${perCustomerTargetCols()}
        FROM sales_current
        ${clause}${extra}
        GROUP BY sap_id
      )
      SELECT COALESCE(SUM(${TARGET_SUM_EXPR}), 0) AS total_target FROM per_customer`,
      allParams,
    );

    const regionResult = await pool.query(
      `SELECT region, SUM(${YESTERDAY_SUM_EXPR}) AS total
       FROM sales_current
       ${clause}${extra}
       GROUP BY region
       ORDER BY total DESC`,
      allParams,
    );

    const productResult = await pool.query(
      `SELECT
        SUM(plc_yesterday)       AS plc_yesterday,
        SUM(plc_plus_yesterday)  AS plc_plus_yesterday,
        SUM(powercrete_yesterday)       AS powercrete_yesterday,
        SUM(pcc_opc_yesterday) AS pcc_opc_yesterday,
        SUM(hwp_yesterday)       AS hwp_yesterday,
        SUM(hcg_yesterday)       AS hcg_yesterday
       FROM sales_current
       ${clause}${extra}`,
      allParams,
    );

    const row = result.rows[0];
    const totalYesterday = Number(row.total_yesterday);
    const totalTarget = Number(targetResult.rows[0]?.total_target ?? 0);
    const regions = regionResult.rows;
    const products = productResult.rows[0] ?? {};

    const productEntries = Object.entries(products)
      .map(
        ([k, v]) =>
          [YESTERDAY_PRODUCT_NAME_MAP[k] ?? k, v] as [string, unknown],
      )
      .sort(([, a], [, b]) => Number(b) - Number(a));

    res.json({
      date_used: defaultDate,
      total_yesterday_sales: totalYesterday,
      total_target: totalTarget,
      achievement_pct: pctOf(totalYesterday, totalTarget),
      total_customers: Number(row.total_customers),
      total_territories: Number(row.total_territories),
      avg_per_customer: Number(row.avg_per_customer),
      top_region: {
        name: regions[0]?.region ?? null,
        value: Number(regions[0]?.total ?? 0),
      },
      lowest_region: {
        name: regions[regions.length - 1]?.region ?? null,
        value: Number(regions[regions.length - 1]?.total ?? 0),
      },
      top_product: {
        name: productEntries[0]?.[0] ?? null,
        value: Number(productEntries[0]?.[1] ?? 0),
      },
      lowest_product: {
        name: productEntries[productEntries.length - 1]?.[0] ?? null,
        value: Number(productEntries[productEntries.length - 1]?.[1] ?? 0),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch yesterday KPI" });
  }
};

// ─── GET /api/sales/yesterday/by-region ───────────────────────────────────────
export const getYesterdayByRegion = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `SELECT
        region,
        SUM(plc_yesterday)       AS plc_yesterday,
        SUM(plc_plus_yesterday)  AS plc_plus_yesterday,
        SUM(powercrete_yesterday)       AS powercrete_yesterday,
        SUM(pcc_opc_yesterday) AS pcc_opc_yesterday,
        SUM(hwp_yesterday)       AS hwp_yesterday,
        SUM(hcg_yesterday)       AS hcg_yesterday,
        SUM(${YESTERDAY_SUM_EXPR}) AS total_yesterday
       FROM sales_current
       ${clause}${extra}
       GROUP BY region
       ORDER BY total_yesterday DESC`,
      allParams,
    );

    // See perCustomerTargetCols — collapse to one row per customer before
    // summing the fixed monthly target across customers in each region.
    const targetResult = await pool.query(
      `WITH per_customer AS (
        SELECT sap_id, region, ${perCustomerTargetCols()}
        FROM sales_current
        ${clause}${extra}
        GROUP BY sap_id, region
      )
      SELECT region, SUM(${TARGET_SUM_EXPR}) AS total_target
      FROM per_customer
      GROUP BY region`,
      allParams,
    );
    const targetByRegion = new Map(
      targetResult.rows.map((r) => [r.region, Number(r.total_target)]),
    );

    res.json({
      date_used: defaultDate,
      data: result.rows.map((r) => {
        const totalYesterday = Number(r.total_yesterday);
        const totalTarget = targetByRegion.get(r.region) ?? 0;
        return {
          region: r.region,
          plc_mtd_sales: Number(r.plc_yesterday),
          plc_plus_mtd_sales: Number(r.plc_plus_yesterday),
          powercrete_mtd_sales: Number(r.powercrete_yesterday),
          pcc_opc_mtd_sales: Number(r.pcc_opc_yesterday),
          hwp_mtd_sales: Number(r.hwp_yesterday),
          hcg_mtd_sales: Number(r.hcg_yesterday),
          total_yesterday: totalYesterday,
          total_target: totalTarget,
          achievement_pct: pctOf(totalYesterday, totalTarget),
        };
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch yesterday region data" });
  }
};

// ─── GET /api/sales/yesterday/by-product ──────────────────────────────────────
export const getYesterdayByProduct = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `SELECT
        SUM(plc_yesterday) AS plc_yesterday,
        SUM(plc_plus_yesterday) AS plc_plus_yesterday,
        SUM(powercrete_yesterday) AS powercrete_yesterday,
        SUM(pcc_opc_yesterday) AS pcc_opc_yesterday,
        SUM(hwp_yesterday) AS hwp_yesterday,
        SUM(hcg_yesterday) AS hcg_yesterday
       FROM sales_current
       ${clause}${extra}`,
      allParams,
    );

    // See perCustomerTargetCols — collapse to one row per customer before
    // summing the fixed monthly target across customers.
    const targetResult = await pool.query(
      `WITH per_customer AS (
        SELECT sap_id, ${perCustomerTargetCols()}
        FROM sales_current
        ${clause}${extra}
        GROUP BY sap_id
      )
      SELECT
        SUM(plc_target) AS plc_target,
        SUM(plc_plus_target) AS plc_plus_target,
        SUM(powercrete_target) AS powercrete_target,
        SUM(pcc_opc_target) AS pcc_opc_target,
        SUM(hwp_target) AS hwp_target,
        SUM(hcg_target) AS hcg_target
       FROM per_customer`,
      allParams,
    );

    const row = result.rows[0];
    const targetRow = targetResult.rows[0] ?? {};
    const totalYesterday =
      Number(row.plc_yesterday) +
      Number(row.plc_plus_yesterday) +
      Number(row.powercrete_yesterday) +
      Number(row.pcc_opc_yesterday) +
      Number(row.hwp_yesterday) +
      Number(row.hcg_yesterday);

    const products = [
      {
        name: "PLC",
        value: Number(row.plc_yesterday),
        target: Number(targetRow.plc_target),
      },
      {
        name: "PLC+",
        value: Number(row.plc_plus_yesterday),
        target: Number(targetRow.plc_plus_target),
      },
      {
        name: "Powercrete",
        value: Number(row.powercrete_yesterday),
        target: Number(targetRow.powercrete_target),
      },
      {
        name: "PCC + OPC",
        value: Number(row.pcc_opc_yesterday),
        target: Number(targetRow.pcc_opc_target),
      },
      {
        name: "HWP",
        value: Number(row.hwp_yesterday),
        target: Number(targetRow.hwp_target),
      },
      {
        name: "HCG",
        value: Number(row.hcg_yesterday),
        target: Number(targetRow.hcg_target),
      },
    ].sort((a, b) => b.value - a.value);

    res.json({
      date_used: defaultDate,
      total_yesterday: totalYesterday,
      data: products.map((p) => ({
        name: p.name,
        value: p.value,
        target: p.target,
        achievement_pct: pctOf(p.value, p.target),
        pct_of_total: pctOf(p.value, totalYesterday),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch yesterday product data" });
  }
};

// ─── GET /api/sales/yesterday/by-territory ────────────────────────────────────
export const getYesterdayByTerritory = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `SELECT
        territory,
        region,
        area,
        SUM(${YESTERDAY_SUM_EXPR}) AS total_yesterday
       FROM sales_current
       ${clause}${extra}
       GROUP BY territory, region, area
       ORDER BY total_yesterday DESC`,
      allParams,
    );

    // See perCustomerTargetCols — collapse to one row per customer before
    // summing the fixed monthly target across customers in each territory.
    const targetResult = await pool.query(
      `WITH per_customer AS (
        SELECT sap_id, territory, region, area, ${perCustomerTargetCols()}
        FROM sales_current
        ${clause}${extra}
        GROUP BY sap_id, territory, region, area
      )
      SELECT territory, region, area, SUM(${TARGET_SUM_EXPR}) AS total_target
      FROM per_customer
      GROUP BY territory, region, area`,
      allParams,
    );
    const targetKey = (t: {
      territory: string;
      region: string;
      area: string;
    }) => `${t.territory}||${t.region}||${t.area}`;
    const targetByTerritory = new Map(
      targetResult.rows.map((r) => [targetKey(r), Number(r.total_target)]),
    );

    res.json({
      date_used: defaultDate,
      data: result.rows.map((r) => {
        const totalYesterday = Number(r.total_yesterday);
        const totalTarget = targetByTerritory.get(targetKey(r)) ?? 0;
        return {
          territory: r.territory,
          region: r.region,
          area: r.area,
          total_yesterday: totalYesterday,
          total_target: totalTarget,
          achievement_pct: pctOf(totalYesterday, totalTarget),
        };
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch yesterday territory data" });
  }
};

// ─── GET /api/sales/yesterday/customers ───────────────────────────────────────
export const getYesterdayCustomers = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `SELECT
        customer_name,
        region,
        area,
        territory,
        tsm_tse,
        asm_kam,
        rsm_b2b_head,
        SUM(${YESTERDAY_SUM_EXPR}) AS total_yesterday,
        MAX(${TARGET_SUM_EXPR})    AS total_target
       FROM sales_current
       ${clause}${extra}
       GROUP BY customer_name, region, area, territory, tsm_tse, asm_kam, rsm_b2b_head
       ORDER BY total_yesterday DESC`,
      allParams,
    );

    const grandTotal = result.rows.reduce(
      (s, r) => s + Number(r.total_yesterday),
      0,
    );

    const customers = result.rows.map((r) => {
      const totalYesterday = Number(r.total_yesterday);
      const totalTarget = Number(r.total_target);
      return {
        customer_name: r.customer_name,
        region: r.region,
        area: r.area,
        territory: r.territory,
        tsm_tse: r.tsm_tse,
        asm_kam: r.asm_kam,
        rsm_b2b_head: r.rsm_b2b_head,
        total_yesterday: totalYesterday,
        total_target: totalTarget,
        achievement_pct: pctOf(totalYesterday, totalTarget),
        pct_share: pctOf(totalYesterday, grandTotal),
      };
    });

    res.json({
      date_used: defaultDate,
      total_customers: customers.length,
      grand_total_yesterday: grandTotal,
      top5: customers.slice(0, 5),
      // Exclude customers with 0 total_yesterday from the bottom 5 — see
      // the same note in getCustomers above.
      bottom5: customers
        .filter((c) => c.total_yesterday !== 0)
        .slice(-5)
        .reverse(),
      data: customers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch yesterday customer data" });
  }
};
