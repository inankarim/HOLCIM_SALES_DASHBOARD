import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { pool } from "../config/db";

// ─── Helper: resolve date filter ─────────────────────────────────────────────
// If user passes ?date=YYYY-MM-DD → use that date
// If user passes ?start_date & ?end_date → use range
// Default → latest available date in sales_current

const PRODUCTS = ["plc", "plc_plus", "pow", "holcim_ss", "hwp", "hcg"];

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

    const result = await pool.query(
      `SELECT
        COALESCE(SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg), 0) AS total_sales,
        COUNT(DISTINCT customer_name)                                    AS total_customers,
        COUNT(DISTINCT territory)                                        AS total_territories,
        COALESCE(AVG(plc + plc_plus + pow + holcim_ss + hwp + hcg), 0) AS avg_per_customer
       FROM sales_current
       ${clause}${extra}`,
      allParams,
    );

    // Top & lowest region
    const regionResult = await pool.query(
      `SELECT region,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
       FROM sales_current
       ${clause}${extra}
       GROUP BY region
       ORDER BY total DESC`,
      allParams,
    );

    // Top & lowest product
    const productResult = await pool.query(
      `SELECT
        SUM(plc)       AS plc,
        SUM(plc_plus)  AS plc_plus,
        SUM(pow)       AS pow,
        SUM(holcim_ss) AS holcim_ss,
        SUM(hwp)       AS hwp,
        SUM(hcg)       AS hcg
       FROM sales_current
       ${clause}${extra}`,
      allParams,
    );

    const regions = regionResult.rows;
    const products = productResult.rows[0];
    const productNameMap: Record<string, string> = {
      plc: "PLC",
      plc_plus: "PLC+",
      pow: "POW",
      holcim_ss: "Holcim SS",
      hwp: "HWP",
      hcg: "HCG",
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
      `SELECT
        region,
        SUM(plc)                                            AS plc,
        SUM(plc_plus)                                       AS plc_plus,
        SUM(pow)                                            AS pow,
        SUM(holcim_ss)                                      AS holcim_ss,
        SUM(hwp)                                            AS hwp,
        SUM(hcg)                                            AS hcg,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg)  AS total
       FROM sales_current
       ${clause}${extra}
       GROUP BY region
       ORDER BY total DESC`,
      allParams,
    );

    res.json({
      date_used: defaultDate,
      data: result.rows.map((r) => ({
        region: r.region,
        plc: Number(r.plc),
        plc_plus: Number(r.plc_plus),
        pow: Number(r.pow),
        holcim_ss: Number(r.holcim_ss),
        hwp: Number(r.hwp),
        hcg: Number(r.hcg),
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
      `SELECT
        SUM(plc)       AS plc,
        SUM(plc_plus)  AS plc_plus,
        SUM(pow)       AS pow,
        SUM(holcim_ss) AS holcim_ss,
        SUM(hwp)       AS hwp,
        SUM(hcg)       AS hcg
       FROM sales_current
       ${clause}${extra}`,
      allParams,
    );

    const row = result.rows[0];
    const total =
      Number(row.plc) +
      Number(row.plc_plus) +
      Number(row.pow) +
      Number(row.holcim_ss) +
      Number(row.hwp) +
      Number(row.hcg);

    const products = [
      { name: "PLC", value: Number(row.plc) },
      { name: "PLC+", value: Number(row.plc_plus) },
      { name: "POW", value: Number(row.pow) },
      { name: "Holcim SS", value: Number(row.holcim_ss) },
      { name: "HWP", value: Number(row.hwp) },
      { name: "HCG", value: Number(row.hcg) },
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

// ─── GET /api/sales/region-product-heatmap ────────────────────────────────────
export const getRegionProductHeatmap = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { clause, params, defaultDate } = await resolveDateFilter(req.query);
    const { extra, params: allParams } = buildFilters(req.query, params);

    const result = await pool.query(
      `SELECT
        region,
        SUM(plc)       AS plc,
        SUM(plc_plus)  AS plc_plus,
        SUM(pow)       AS pow,
        SUM(holcim_ss) AS holcim_ss,
        SUM(hwp)       AS hwp,
        SUM(hcg)       AS hcg,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
       FROM sales_current
       ${clause}${extra}
       GROUP BY region
       ORDER BY total DESC`,
      allParams,
    );

    res.json({
      date_used: defaultDate,
      data: result.rows.map((r) => ({
        region: r.region,
        plc: Number(r.plc),
        plc_plus: Number(r.plc_plus),
        pow: Number(r.pow),
        holcim_ss: Number(r.holcim_ss),
        hwp: Number(r.hwp),
        hcg: Number(r.hcg),
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
      `SELECT
        area,
        region,
        SUM(plc)       AS plc,
        SUM(plc_plus)  AS plc_plus,
        SUM(pow)       AS pow,
        SUM(holcim_ss) AS holcim_ss,
        SUM(hwp)       AS hwp,
        SUM(hcg)       AS hcg,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
       FROM sales_current
       ${clause}${extra}
       GROUP BY area, region
       ORDER BY total DESC`,
      allParams,
    );

    res.json({
      date_used: defaultDate,
      data: result.rows.map((r) => ({
        area: r.area,
        region: r.region,
        plc: Number(r.plc),
        plc_plus: Number(r.plc_plus),
        pow: Number(r.pow),
        holcim_ss: Number(r.holcim_ss),
        hwp: Number(r.hwp),
        hcg: Number(r.hcg),
        total: Number(r.total),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch area data" });
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
      `SELECT
        territory,
        region,
        area,
        SUM(plc)       AS plc,
        SUM(plc_plus)  AS plc_plus,
        SUM(pow)       AS pow,
        SUM(holcim_ss) AS holcim_ss,
        SUM(hwp)       AS hwp,
        SUM(hcg)       AS hcg,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
       FROM sales_current
       ${clause}${extra}
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
        plc: Number(r.plc),
        plc_plus: Number(r.plc_plus),
        pow: Number(r.pow),
        holcim_ss: Number(r.holcim_ss),
        hwp: Number(r.hwp),
        hcg: Number(r.hcg),
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
        SUM(plc)       AS plc,
        SUM(plc_plus)  AS plc_plus,
        SUM(pow)       AS pow,
        SUM(holcim_ss) AS holcim_ss,
        SUM(hwp)       AS hwp,
        SUM(hcg)       AS hcg,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
      plc: Number(r.plc),
      plc_plus: Number(r.plc_plus),
      pow: Number(r.pow),
      holcim_ss: Number(r.holcim_ss),
      hwp: Number(r.hwp),
      hcg: Number(r.hcg),
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
      bottom5: customers.slice(-5).reverse(),
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

    // Regions ranked
    const regionResult = await pool.query(
      `SELECT region,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
       FROM sales_current ${clause}${extra}
       GROUP BY region ORDER BY total DESC`,
      allParams,
    );

    // Territories ranked
    const territoryResult = await pool.query(
      `SELECT territory,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
       FROM sales_current ${clause}${extra}
       GROUP BY territory ORDER BY total DESC`,
      allParams,
    );

    // Customers ranked
    const customerResult = await pool.query(
      `SELECT customer_name,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
       FROM sales_current ${clause}${extra}
       GROUP BY customer_name ORDER BY total DESC`,
      allParams,
    );

    // Products total
    const productResult = await pool.query(
      `SELECT
        SUM(plc) AS plc, SUM(plc_plus) AS plc_plus,
        SUM(pow) AS pow, SUM(holcim_ss) AS holcim_ss,
        SUM(hwp) AS hwp, SUM(hcg) AS hcg
       FROM sales_current ${clause}${extra}`,
      allParams,
    );

    // Product dependency per top 3 regions
    const regions = regionResult.rows.slice(0, 3);
    const dependency = await Promise.all(
      regions.map(async (reg) => {
        const depParams = [...allParams, reg.region];
        const depClause =
          clause
            .replace("WHERE", "WHERE region = $" + depParams.length + " AND (")
            .replace("$1", "$1") + (clause.includes("WHERE 1=0") ? "" : ")");

        const r = await pool.query(
          `SELECT
            SUM(plc) AS plc, SUM(plc_plus) AS plc_plus,
            SUM(pow) AS pow, SUM(holcim_ss) AS holcim_ss,
            SUM(hwp) AS hwp, SUM(hcg) AS hcg
           FROM sales_current
           ${clause}${extra} AND region = $${depParams.length}`,
          depParams,
        );
        const row = r.rows[0];
        const products = {
          PLC: Number(row.plc),
          "PLC+": Number(row.plc_plus),
          POW: Number(row.pow),
          "Holcim SS": Number(row.holcim_ss),
          HWP: Number(row.hwp),
          HCG: Number(row.hcg),
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
      PLC: Number(pRow.plc),
      "PLC+": Number(pRow.plc_plus),
      POW: Number(pRow.pow),
      "Holcim SS": Number(pRow.holcim_ss),
      HWP: Number(pRow.hwp),
      HCG: Number(pRow.hcg),
    }).sort(([, a], [, b]) => b - a);

    const regions_list = regionResult.rows;
    const territories_list = territoryResult.rows;
    const customers_list = customerResult.rows;

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
        name: customers_list[customers_list.length - 1]?.customer_name,
        value: Number(customers_list[customers_list.length - 1]?.total ?? 0),
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

    // ── 1. Bottom 5 TSM/TSE ──────────────────────────────────────────────────
    const bottomTsm = await pool.query(
      `SELECT tsm_tse,
        COUNT(DISTINCT customer_name) AS customers,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
       FROM sales_current ${clause}${extra}
       AND rsm_b2b_head != ''
       GROUP BY rsm_b2b_head
       ORDER BY total ASC
       LIMIT 5`,
      allParams,
    );

    // ── 4. Bottom 5 customers ─────────────────────────────────────────────────
    const bottomCustomers = await pool.query(
      `SELECT customer_name, region, area, territory, tsm_tse, asm_kam,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
       FROM sales_current ${clause}${extra}
       GROUP BY customer_name, region, area, territory, tsm_tse, asm_kam
       ORDER BY total ASC
       LIMIT 5`,
      allParams,
    );

    // ── 5. Bottom 5 territories ───────────────────────────────────────────────
    const bottomTerritories = await pool.query(
      `SELECT territory, region, area,
        COUNT(DISTINCT customer_name) AS customers,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
       FROM sales_current ${clause}${extra}
       AND tsm_tse ILIKE '%vacant%'
       GROUP BY territory, region, area
       ORDER BY total DESC`,
      allParams,
    );

    // ── 7. Zero/low sales customers (bottom 10%) ──────────────────────────────
    const avgResult = await pool.query(
      `SELECT AVG(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS avg
       FROM sales_current ${clause}${extra}`,
      allParams,
    );
    const avgSales = Number(avgResult.rows[0]?.avg ?? 0);
    const threshold = avgSales * 0.1; // bottom 10% of average

    const lowSalesCustomers = await pool.query(
      `SELECT customer_name, region, area, territory, tsm_tse,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
       FROM sales_current ${clause}${extra}
       GROUP BY customer_name, region, area, territory, tsm_tse
       HAVING SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) <= $${allParams.length + 1}
       ORDER BY total ASC
       LIMIT 20`,
      [...allParams, threshold],
    );

    // ── 8. Single product customers (upsell opportunity) ─────────────────────
    const singleProductCustomers = await pool.query(
      `SELECT customer_name, region, area, territory, tsm_tse,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total,
        (CASE WHEN SUM(plc) > 0 THEN 1 ELSE 0 END +
         CASE WHEN SUM(plc_plus) > 0 THEN 1 ELSE 0 END +
         CASE WHEN SUM(pow) > 0 THEN 1 ELSE 0 END +
         CASE WHEN SUM(holcim_ss) > 0 THEN 1 ELSE 0 END +
         CASE WHEN SUM(hwp) > 0 THEN 1 ELSE 0 END +
         CASE WHEN SUM(hcg) > 0 THEN 1 ELSE 0 END) AS products_buying
       FROM sales_current ${clause}${extra}
       GROUP BY customer_name, region, area, territory, tsm_tse
       HAVING (CASE WHEN SUM(plc) > 0 THEN 1 ELSE 0 END +
               CASE WHEN SUM(plc_plus) > 0 THEN 1 ELSE 0 END +
               CASE WHEN SUM(pow) > 0 THEN 1 ELSE 0 END +
               CASE WHEN SUM(holcim_ss) > 0 THEN 1 ELSE 0 END +
               CASE WHEN SUM(hwp) > 0 THEN 1 ELSE 0 END +
               CASE WHEN SUM(hcg) > 0 THEN 1 ELSE 0 END) = 1
       ORDER BY total DESC
       LIMIT 20`,
      allParams,
    );

    // ── 9. Customer concentration risk ───────────────────────────────────────
    const concentrationResult = await pool.query(
      `WITH ranked AS (
        SELECT customer_name,
          SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
      `SELECT
        SUM(plc) AS plc, SUM(plc_plus) AS plc_plus,
        SUM(pow) AS pow, SUM(holcim_ss) AS holcim_ss,
        SUM(hwp) AS hwp, SUM(hcg) AS hcg,
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
       FROM sales_current ${clause}${extra}`,
      allParams,
    );

    const pRow = productResult.rows[0];
    const totalSales = Number(pRow.total ?? 0);
    const productConcentration = [
      { name: "PLC", value: Number(pRow.plc) },
      { name: "PLC+", value: Number(pRow.plc_plus) },
      { name: "POW", value: Number(pRow.pow) },
      { name: "Holcim SS", value: Number(pRow.holcim_ss) },
      { name: "HWP", value: Number(pRow.hwp) },
      { name: "HCG", value: Number(pRow.hcg) },
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
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total,
        AVG(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS avg_per_customer
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
          SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
        SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
          SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
