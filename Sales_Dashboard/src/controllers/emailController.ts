import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { pool } from "../config/db";
import { transporter } from "../config/email";
import { buildDashboardEmail } from "../utils/emailTemplate";

// ─── Helper: fixed business order for region tables (not alphabetical) ──────
// Same convention as salesController.ts's getRsmRegionReport — the RSM/
// Region tables in the email need a fixed display order rather than
// whatever order the SQL groups them in. Region names are normalized
// (letters/digits only, lowercased) before matching so minor formatting
// differences ("Non-Trade" vs "Non Trade") still line up. Any region not
// found in REGION_ORDER sorts after all named regions, in the order it
// was encountered.
const REGION_ORDER = [
  "Dhaka Metro",
  "Dhaka Outer",
  "Cumilla",
  "Sylhet",
  "Rajshahi",
  "Khulna",
  "Chattogram",
  "Non Trade",
];

function normalizeRegionName(region: string | null | undefined): string {
  return (region || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const REGION_ORDER_NORMALIZED = REGION_ORDER.map(normalizeRegionName);

function regionSortIndex(region: string | null | undefined): number {
  const idx = REGION_ORDER_NORMALIZED.indexOf(normalizeRegionName(region));
  return idx === -1 ? REGION_ORDER_NORMALIZED.length : idx;
}

function sortByRegion<T extends { region: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => regionSortIndex(a.region) - regionSortIndex(b.region),
  );
}

// ─── Helper: Chittagong / Chattogram exclusion for "Lowest Region" KPI ──────
// Chittagong (a.k.a. Chattogram) should never be surfaced as the "Lowest
// Region" KPI card — if it happens to be the worst-performing region for
// the date, fall through to the next-lowest region that isn't Chittagong
// instead. Matches on the normalized name so either spelling is caught.
function isChittagong(region: string | null | undefined): boolean {
  const norm = normalizeRegionName(region);
  return norm === "chittagong" || norm === "chattogram";
}

export const sendDashboardEmail = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { to, cc, date, charts } = req.body;

    if (!to || !date) {
      res.status(400).json({ error: "Recipient email and date are required." });
      return;
    }

    // Normalize to array
    const toList: string[] = Array.isArray(to) ? to : [to];

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = toList.filter((e) => !emailPattern.test(e.trim()));
    if (invalidEmails.length > 0) {
      res
        .status(400)
        .json({ error: `Invalid email(s): ${invalidEmails.join(", ")}` });
      return;
    }

    // Deduplicate
    const uniqueTo = [...new Set(toList.map((e) => e.trim().toLowerCase()))];
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(date)) {
      res.status(400).json({ error: "Invalid date format." });
      return;
    }

    // Fetch all data for this date
    //
    // NOTE: `sales_current` does NOT have columns named plc / plc_plus / pow /
    // holcim_ss / hwp / hcg — the real columns are plc_yesterday / plc_mtd_sales
    // etc. (see salesController.ts).
    //
    // Two different metrics live on this table and must not be mixed up:
    //   - *_yesterday: the day's actual sales delta. Every "sales figure"
    //     query below (KPI, by-region, by-product, insights, deep-insights,
    //     by-area) sums THIS column — summing *_mtd_sales instead double-counts,
    //     since it's a cumulative-as-of-upload snapshot, not a daily figure.
    //     The result is still aliased as `${key}_mtd_sales` so downstream
    //     field names / the email template stay unchanged.
    //     EXCEPTION: top5_customers (below) intentionally sums *_mtd_sales
    //     instead, so "Top 5 Customers" reflects cumulative month-to-date
    //     volume rather than a single day's sales. Every other deep-insight
    //     metric (bottom TSM/TSE, bottom ASM/KAM, bottom territories,
    //     concentration %) still ranks off the daily *_yesterday figure, so
    //     this section now intentionally mixes MTD and daily bases.
    //   - *_mtd_sales / *_target: the true cumulative MTD-vs-target snapshot.
    //     Only the "MTD vs Target by product" query below is meant to read
    //     these columns directly.
    //
    // RSM / Region report (rsmReportResult / rsmReportD2RResult) is a
    // SNAPSHOT metric like MTD vs Target, but it does NOT read *_target off
    // sales_current — it joins the dedicated sales_targets table (via
    // brand_product_map), the same source salesController.ts's
    // getRsmRegionReport uses. sales_current's *_target columns don't carry
    // the Distributor+B2B/D2R split this report needs, and region/customer
    // type spelling isn't guaranteed to match 1:1 between sales_current and
    // sales_targets, so both sides are normalized (letters only, lowercased)
    // before joining — identical to the dashboard endpoint, so the emailed
    // report can't drift from what the dashboard shows.
    const [
      kpiResult,
      regionResult,
      productResult,
      insightsResult,
      deepInsightsResult,
      mtdTargetResult,
      areaResult,
      rsmReportResult,
      rsmReportD2RResult,
    ] = await Promise.all([
      // KPI
      // Actual sales for the date — sum the *_yesterday deltas (never the
      // *_mtd_sales cumulative snapshot), collapsed to one row per customer
      // first so avg_per_customer is a true per-customer average.
      pool.query(
        `
        WITH per_customer AS (
          SELECT sap_id, customer_name, territory,
            SUM(plc_yesterday) AS plc_mtd_sales, SUM(plc_plus_yesterday) AS plc_plus_mtd_sales,
            SUM(powercrete_yesterday) AS powercrete_mtd_sales, SUM(pcc_opc_yesterday) AS pcc_opc_mtd_sales,
            SUM(hwp_yesterday) AS hwp_mtd_sales, SUM(hcg_yesterday) AS hcg_mtd_sales
          FROM sales_current
          WHERE upload_date = $1
          GROUP BY sap_id, customer_name, territory
        )
        SELECT
          COALESCE(SUM(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales), 0) AS total_sales,
          COUNT(DISTINCT sap_id) AS total_customers,
          COUNT(DISTINCT territory) AS total_territories,
          COALESCE(AVG(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales), 0) AS avg_per_customer
        FROM per_customer
      `,
        [date],
      ),

      // By Region
      // Actual sales per region — sum *_yesterday, aliased as *_mtd_sales so
      // downstream field names / template mapping stay unchanged.
      pool.query(
        `
        SELECT region,
          SUM(plc_yesterday) AS plc_mtd_sales, SUM(plc_plus_yesterday) AS plc_plus_mtd_sales,
          SUM(powercrete_yesterday) AS powercrete_mtd_sales, SUM(pcc_opc_yesterday) AS pcc_opc_mtd_sales,
          SUM(hwp_yesterday) AS hwp_mtd_sales, SUM(hcg_yesterday) AS hcg_mtd_sales,
          SUM(plc_yesterday + plc_plus_yesterday + powercrete_yesterday + pcc_opc_yesterday + hwp_yesterday + hcg_yesterday) AS total
        FROM sales_current
        WHERE upload_date = $1
        GROUP BY region
        ORDER BY total DESC
      `,
        [date],
      ),

      // By Product
      pool.query(
        `
        SELECT
          SUM(plc_yesterday) AS plc_mtd_sales, SUM(plc_plus_yesterday) AS plc_plus_mtd_sales,
          SUM(powercrete_yesterday) AS powercrete_mtd_sales, SUM(pcc_opc_yesterday) AS pcc_opc_mtd_sales,
          SUM(hwp_yesterday) AS hwp_mtd_sales, SUM(hcg_yesterday) AS hcg_mtd_sales
        FROM sales_current
        WHERE upload_date = $1
      `,
        [date],
      ),

      // Insights
      // Always the true daily sales total — sum *_yesterday, never
      // *_mtd_sales (that's a cumulative snapshot, not a per-day figure).
      //
      // lowest_customer / lowest_customer_value: excludes customers whose
      // total for the date is exactly 0 via HAVING, so a customer with no
      // activity that day never gets surfaced as the "lowest" performer —
      // the next-lowest customer with actual (non-zero) sales is picked instead.
      pool.query(
        `
        SELECT
          (SELECT region FROM sales_current WHERE upload_date = $1
            GROUP BY region ORDER BY SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) DESC LIMIT 1) AS best_region,
          (SELECT SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) FROM sales_current WHERE upload_date = $1
            GROUP BY region ORDER BY SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) DESC LIMIT 1) AS best_region_value,
          (SELECT region FROM sales_current WHERE upload_date = $1
            GROUP BY region ORDER BY SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) ASC LIMIT 1) AS worst_region,
          (SELECT SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) FROM sales_current WHERE upload_date = $1
            GROUP BY region ORDER BY SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) ASC LIMIT 1) AS worst_region_value,
          (SELECT territory FROM sales_current WHERE upload_date = $1
            GROUP BY territory ORDER BY SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) ASC LIMIT 1) AS weakest_territory,
          (SELECT SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) FROM sales_current WHERE upload_date = $1
            GROUP BY territory ORDER BY SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) ASC LIMIT 1) AS weakest_territory_value,
          (SELECT customer_name FROM sales_current WHERE upload_date = $1
            GROUP BY customer_name ORDER BY SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) DESC LIMIT 1) AS top_customer,
          (SELECT SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) FROM sales_current WHERE upload_date = $1
            GROUP BY customer_name ORDER BY SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) DESC LIMIT 1) AS top_customer_value,
          (SELECT customer_name FROM sales_current WHERE upload_date = $1
            GROUP BY customer_name
            HAVING SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) <> 0
            ORDER BY SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) ASC LIMIT 1) AS lowest_customer,
          (SELECT SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) FROM sales_current WHERE upload_date = $1
            GROUP BY customer_name
            HAVING SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) <> 0
            ORDER BY SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) ASC LIMIT 1) AS lowest_customer_value
      `,
        [date],
      ),

      // Deep Insights
      // bottom5_tsm / bottom5_asm / top5_customers all rank on *_mtd_sales
      // (cumulative month-to-date), not the daily *_yesterday delta — a
      // single bad/good day for a TSM or ASM/KAM shouldn't flip who shows
      // up here. bottom5_territories and the concentration % (top5/10/20_pct)
      // still rank off the daily *_yesterday figure, so this section
      // intentionally mixes MTD and daily bases across its sub-queries.
      pool.query(
        `
        WITH totals AS (
          SELECT SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) AS grand_total FROM sales_current WHERE upload_date = $1
        ),
        ranked_customers AS (
          SELECT customer_name, SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) AS total
          FROM sales_current WHERE upload_date = $1
          GROUP BY customer_name ORDER BY total DESC
        )
        SELECT
          (SELECT JSON_AGG(r) FROM (
            SELECT tsm_tse,
              ARRAY_AGG(DISTINCT territory) AS territories,
              COUNT(DISTINCT customer_name) AS customers,
              SUM(plc_mtd_sales+plc_plus_mtd_sales+powercrete_mtd_sales+pcc_opc_mtd_sales+hwp_mtd_sales+hcg_mtd_sales) AS total
            FROM sales_current WHERE upload_date = $1
            AND tsm_tse NOT ILIKE '%vacant%' AND tsm_tse != ''
            GROUP BY tsm_tse ORDER BY total ASC LIMIT 5
          ) r) AS bottom5_tsm,
          (SELECT JSON_AGG(r) FROM (
            SELECT asm_kam,
              ARRAY_AGG(DISTINCT area) AS areas,
              COUNT(DISTINCT customer_name) AS customers,
              SUM(plc_mtd_sales+plc_plus_mtd_sales+powercrete_mtd_sales+pcc_opc_mtd_sales+hwp_mtd_sales+hcg_mtd_sales) AS total
            FROM sales_current WHERE upload_date = $1
            AND asm_kam != ''
            GROUP BY asm_kam ORDER BY total ASC LIMIT 5
          ) r) AS bottom5_asm,
          (SELECT JSON_AGG(r) FROM (
            SELECT territory, region, area,
              COUNT(DISTINCT customer_name) AS customers,
              SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) AS total
            FROM sales_current WHERE upload_date = $1
            GROUP BY territory, region, area ORDER BY total ASC LIMIT 5
          ) r) AS bottom5_territories,
          (SELECT JSON_AGG(r) FROM (
            SELECT customer_name, region, area, territory, tsm_tse,
              SUM(plc_mtd_sales+plc_plus_mtd_sales+powercrete_mtd_sales+pcc_opc_mtd_sales+hwp_mtd_sales+hcg_mtd_sales) AS total
            FROM sales_current WHERE upload_date = $1
            GROUP BY customer_name, region, area, territory, tsm_tse
            ORDER BY total DESC LIMIT 5
          ) r) AS top5_customers,
          (SELECT ROUND((SUM(CASE WHEN rn <= 5 THEN total ELSE 0 END) / MAX(grand_total) * 100)::numeric, 2)
            FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY total DESC) AS rn FROM ranked_customers) r
            CROSS JOIN totals) AS top5_pct,
          (SELECT ROUND((SUM(CASE WHEN rn <= 10 THEN total ELSE 0 END) / MAX(grand_total) * 100)::numeric, 2)
            FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY total DESC) AS rn FROM ranked_customers) r
            CROSS JOIN totals) AS top10_pct,
          (SELECT ROUND((SUM(CASE WHEN rn <= 20 THEN total ELSE 0 END) / MAX(grand_total) * 100)::numeric, 2)
            FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY total DESC) AS rn FROM ranked_customers) r
            CROSS JOIN totals) AS top20_pct,
          (SELECT grand_total FROM totals) AS grand_total
      `,
        [date],
      ),

      // MTD vs Target by product — this is what powers the
      // "MTD Target Achievement" section in the email. Mirrors
      // salesController.ts's getMtdTargetByProduct: reads *_mtd_sales /
      // *_target straight off sales_current for the single resolved date
      // (a true snapshot metric, safe to sum directly since this handler
      // only ever runs for one date, never a range).
      pool.query(
        `
        SELECT
          SUM(plc_mtd_sales) AS plc_mtd_sales, SUM(plc_target) AS plc_target,
          SUM(plc_plus_mtd_sales) AS plc_plus_mtd_sales, SUM(plc_plus_target) AS plc_plus_target,
          SUM(powercrete_mtd_sales) AS powercrete_mtd_sales, SUM(powercrete_target) AS powercrete_target,
          SUM(pcc_opc_mtd_sales) AS pcc_opc_mtd_sales, SUM(pcc_opc_target) AS pcc_opc_target,
          SUM(hwp_mtd_sales) AS hwp_mtd_sales, SUM(hwp_target) AS hwp_target,
          SUM(hcg_mtd_sales) AS hcg_mtd_sales, SUM(hcg_target) AS hcg_target
        FROM sales_current
        WHERE upload_date = $1
      `,
        [date],
      ),

      // ── All areas (no LIMIT) — powers the "Area Performance" section.
      // Previously this section reused deepInsights' bottom5_territories
      // data (limited to 5 worst-performing territories), which is why
      // it only ever showed 5 rows and duplicated the Bottom Performers
      // section below it. This is a real, independent area-level rollup
      // of every area for the date, sorted best-to-worst.
      //
      // FIX: the previous version of this query had two SQL bugs that
      // made it fail on every call:
      //   1. `AS customer_d-1_sales` used a bare hyphen inside an
      //      unquoted identifier, which Postgres parses as
      //      "customer_d - 1_sales" (a subtraction) — a syntax error.
      //      Renamed to `customer_d1_sales` (no hyphen).
      //   2. The outer SELECT referenced `SUM(customer_target)`, but
      //      `customer_target` was never computed in the `per_customer`
      //      CTE (sales_current has no per-row target column to sum
      //      here), so this raised "column customer_target does not
      //      exist". It's removed — `allAreas` downstream never reads a
      //      `target` field anyway.
      pool.query(
        `
        WITH per_customer AS (
          SELECT area, asm_kam, customer_name,
            SUM(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales) AS customer_mtd_sales,
            SUM(plc_yesterday + plc_plus_yesterday + powercrete_yesterday + pcc_opc_yesterday + hwp_yesterday + hcg_yesterday) AS customer_d1_sales
          FROM sales_current
          WHERE upload_date = $1
          GROUP BY area, asm_kam, customer_name
        )
        SELECT area, asm_kam,
          COUNT(DISTINCT customer_name) FILTER (WHERE customer_mtd_sales > 0) AS customers,
          SUM(customer_mtd_sales) AS mtd_sales,
          SUM(customer_d1_sales) AS d1_sales
        FROM per_customer
        GROUP BY area, asm_kam
        ORDER BY d1_sales DESC
      `,
        [date],
      ),

      // ── RSM / Region report — product-wise, EXCLUDING customer_type = 'D2R'.
      //
      // Fixed to match salesController.ts's getRsmRegionReport exactly:
      //   1. Target comes from the dedicated sales_targets table (joined via
      //      brand_product_map), NOT from sales_current's *_target columns —
      //      those don't carry the Distributor+B2B/D2R split this report
      //      needs, so reading them directly here would silently produce
      //      different numbers than the dashboard's RSM/Region report.
      //   2. region / customer_type are normalized (letters only, lowercased)
      //      on both sides before grouping/joining, since raw spelling in
      //      sales_current and sales_targets doesn't always match exactly.
      //   3. days_in_month is derived from the actual resolved date's month
      //      (28/29/30/31) instead of a hardcoded 30 — a fixed divisor of 30
      //      overstates the daily target rate in 31-day months and
      //      understates it in February.
      //   4. Every ROUND(...) argument is cast to ::numeric explicitly —
      //      EXTRACT() returns double precision, and Postgres's 2-argument
      //      ROUND(value, decimals) only exists for numeric, so leaving any
      //      double precision in the expression throws
      //      "function round(double precision, integer) does not exist".
      pool.query(
        `
        WITH product_unpivot AS (
          SELECT
            region,
            lower(regexp_replace(region, '[^a-zA-Z]', '', 'g')) AS region_norm,
            rsm_b2b_head AS rsm, upload_date,
            lower(regexp_replace(customer_type, '[^a-zA-Z]', '', 'g')) AS ctype_norm,
            'PLC' AS product, plc_mtd_sales AS mtd_sales, plc_yesterday AS yesterday
          FROM sales_current
          UNION ALL
          SELECT region, lower(regexp_replace(region, '[^a-zA-Z]', '', 'g')),
                 rsm_b2b_head, upload_date,
                 lower(regexp_replace(customer_type, '[^a-zA-Z]', '', 'g')),
                 'PLC+', plc_plus_mtd_sales, plc_plus_yesterday
          FROM sales_current
          UNION ALL
          SELECT region, lower(regexp_replace(region, '[^a-zA-Z]', '', 'g')),
                 rsm_b2b_head, upload_date,
                 lower(regexp_replace(customer_type, '[^a-zA-Z]', '', 'g')),
                 'Powercrete', powercrete_mtd_sales, powercrete_yesterday
          FROM sales_current
          UNION ALL
          SELECT region, lower(regexp_replace(region, '[^a-zA-Z]', '', 'g')),
                 rsm_b2b_head, upload_date,
                 lower(regexp_replace(customer_type, '[^a-zA-Z]', '', 'g')),
                 'Holcim', pcc_opc_mtd_sales, pcc_opc_yesterday
          FROM sales_current
          UNION ALL
          SELECT region, lower(regexp_replace(region, '[^a-zA-Z]', '', 'g')),
                 rsm_b2b_head, upload_date,
                 lower(regexp_replace(customer_type, '[^a-zA-Z]', '', 'g')),
                 'HWP', hwp_mtd_sales, hwp_yesterday
          FROM sales_current
          UNION ALL
          SELECT region, lower(regexp_replace(region, '[^a-zA-Z]', '', 'g')),
                 rsm_b2b_head, upload_date,
                 lower(regexp_replace(customer_type, '[^a-zA-Z]', '', 'g')),
                 'HCG', hcg_mtd_sales, hcg_yesterday
          FROM sales_current
        ),
        params AS (
          SELECT
            date_trunc('month', $1::date)::date AS target_month,
            EXTRACT(DAY FROM $1::date)::numeric AS day_of_month,
            EXTRACT(DAY FROM (date_trunc('month', $1::date) + INTERVAL '1 month - 1 day'))::numeric AS days_in_month
        ),
        sales_agg AS (
          SELECT
            product, region_norm,
            MIN(region) AS region_display,
            rsm,
            SUM(mtd_sales) AS mtd_sales_sum,
            SUM(yesterday) AS yesterday_sum
          FROM product_unpivot
          WHERE upload_date = $1
            AND ctype_norm != 'd2r'
          GROUP BY product, region_norm, rsm
        ),
        product_prefix_map (product, product_prefix) AS (
          VALUES
            ('PLC', 'plc'), ('PLC+', 'plc_plus'), ('Powercrete', 'powercrete'),
            ('Holcim', 'pcc_opc'), ('HWP', 'hwp'), ('HCG', 'hcg')
        ),
        target_agg AS (
          SELECT
            ppm.product,
            lower(regexp_replace(st.region, '[^a-zA-Z]', '', 'g')) AS region_norm,
            SUM(st.target_value) AS target_sum
          FROM sales_targets st
          CROSS JOIN params p
          JOIN brand_product_map bpm ON bpm.brand = st.brand
          JOIN product_prefix_map ppm ON ppm.product_prefix = bpm.product_prefix
          WHERE st.target_month = p.target_month
            AND st.customer_type IN ('Distributor', 'B2B')
          GROUP BY ppm.product, lower(regexp_replace(st.region, '[^a-zA-Z]', '', 'g'))
        )
        SELECT
          s.product,
          s.region_display AS region,
          s.rsm,
          t.target_sum,
          ROUND((t.target_sum / p.days_in_month * p.day_of_month)::numeric, 2) AS mtd_target,
          s.mtd_sales_sum,
          ROUND((s.mtd_sales_sum / NULLIF(t.target_sum / p.days_in_month * p.day_of_month, 0))::numeric, 4) AS ach_mtd,
          s.yesterday_sum,
          ROUND((s.yesterday_sum / NULLIF(t.target_sum / p.days_in_month, 0))::numeric, 4) AS ach_today,
          ROUND(((t.target_sum - s.mtd_sales_sum) / NULLIF(p.days_in_month - p.day_of_month, 0))::numeric, 2) AS per_day_req,
          ROUND((s.mtd_sales_sum / NULLIF(p.day_of_month, 0))::numeric, 2) AS reg_per_day
        FROM sales_agg s
        LEFT JOIN target_agg t ON t.product = s.product AND t.region_norm = s.region_norm
        CROSS JOIN params p
        ORDER BY s.product, s.region_display, s.rsm
      `,
        [date],
      ),

      // ── RSM / Region report — D2R, treated as one combined "product".
      //
      // Same fix as the product query above: target comes from
      // sales_targets (customer_type = 'D2R', brand = 'Total'), region is
      // normalized on both sides, days_in_month is derived from the actual
      // month instead of hardcoded 30, and every ROUND(...) argument is
      // cast to ::numeric.
      pool.query(
        `
        WITH totals AS (
          SELECT
            lower(regexp_replace(region, '[^a-zA-Z0-9]', '', 'g')) AS region_norm,
            MIN(region) AS region_display,
            rsm_b2b_head AS rsm,
            SUM(plc_mtd_sales + plc_plus_mtd_sales + powercrete_mtd_sales + pcc_opc_mtd_sales + hwp_mtd_sales + hcg_mtd_sales) AS mtd_sales_sum,
            SUM(plc_yesterday + plc_plus_yesterday + powercrete_yesterday + pcc_opc_yesterday + hwp_yesterday + hcg_yesterday) AS yesterday_sum
          FROM sales_current
          WHERE upload_date = $1
            AND lower(regexp_replace(customer_type, '[^a-zA-Z0-9]', '', 'g')) = 'd2r'
          GROUP BY region_norm, rsm_b2b_head
        ),
        params AS (
          SELECT
            date_trunc('month', $1::date)::date AS target_month,
            EXTRACT(DAY FROM $1::date)::numeric AS day_of_month,
            EXTRACT(DAY FROM (date_trunc('month', $1::date) + INTERVAL '1 month - 1 day'))::numeric AS days_in_month
        ),
        target_agg AS (
          SELECT
            lower(regexp_replace(st.region, '[^a-zA-Z0-9]', '', 'g')) AS region_norm,
            SUM(st.target_value) AS target_sum
          FROM sales_targets st
          CROSS JOIN params p
          WHERE st.target_month = p.target_month
            AND st.customer_type = 'D2R'
            AND st.brand = 'Total'
          GROUP BY lower(regexp_replace(st.region, '[^a-zA-Z0-9]', '', 'g'))
        )
        SELECT
          t.region_display AS region,
          t.rsm,
          ta.target_sum,
          ROUND((ta.target_sum / p.days_in_month * p.day_of_month)::numeric, 2) AS mtd_target,
          t.mtd_sales_sum,
          ROUND((t.mtd_sales_sum / NULLIF(ta.target_sum / p.days_in_month * p.day_of_month, 0))::numeric, 4) AS ach_mtd,
          t.yesterday_sum,
          ROUND((t.yesterday_sum / NULLIF(ta.target_sum / p.days_in_month, 0))::numeric, 4) AS ach_today,
          ROUND(((ta.target_sum - t.mtd_sales_sum) / NULLIF(p.days_in_month - p.day_of_month, 0))::numeric, 2) AS per_day_req,
          ROUND((t.mtd_sales_sum / NULLIF(p.day_of_month, 0))::numeric, 2) AS reg_per_day
        FROM totals t
        LEFT JOIN target_agg ta ON ta.region_norm = t.region_norm
        CROSS JOIN params p
        ORDER BY t.region_display, t.rsm
      `,
        [date],
      ),
    ]);

    // Process KPI
    const kpiRow = kpiResult.rows[0];
    const totalSales = Number(kpiRow.total_sales);

    // Process products
    const pRow = productResult.rows[0];
    const products = [
      { name: "SuperCreate", value: Number(pRow.plc_mtd_sales) },
      { name: "SuperCreate Plus+", value: Number(pRow.plc_plus_mtd_sales) },
      { name: "Powercrete", value: Number(pRow.powercrete_mtd_sales) },
      { name: "Holcim", value: Number(pRow.pcc_opc_mtd_sales) },
      { name: "HWP", value: Number(pRow.hwp_mtd_sales) },
      { name: "HCG", value: Number(pRow.hcg_mtd_sales) },
    ]
      .sort((a, b) => b.value - a.value)
      .map((p) => ({
        ...p,
        pct: totalSales ? (p.value / totalSales) * 100 : 0,
      }));

    const ins = insightsResult.rows[0];
    const deepRow = deepInsightsResult.rows[0];

    const sortedProducts = [...products];
    const topProduct = sortedProducts[0];
    const lowestProduct = sortedProducts[sortedProducts.length - 1];

    const regionsSorted = regionResult.rows.sort(
      (a: any, b: any) => Number(b.total) - Number(a.total),
    );

    // "Lowest Region" KPI card should never surface Chittagong/Chattogram —
    // if it's the worst-performing region for the date, fall through to the
    // next-lowest region that isn't Chittagong instead (same exclusion
    // pattern used for lowest_customer above).
    const regionsSortedExclChittagong = regionsSorted.filter(
      (r: any) => !isChittagong(r.region),
    );
    const lowestRegionRow = regionsSortedExclChittagong.length
      ? regionsSortedExclChittagong[regionsSortedExclChittagong.length - 1]
      : regionsSorted[regionsSorted.length - 1];

    const kpi = {
      total_sales: totalSales,
      total_customers: Number(kpiRow.total_customers),
      total_territories: Number(kpiRow.total_territories),
      avg_per_customer: Number(kpiRow.avg_per_customer),
      top_region: {
        name: regionsSorted[0]?.region,
        value: Number(regionsSorted[0]?.total),
      },
      lowest_region: {
        name: lowestRegionRow?.region,
        value: Number(lowestRegionRow?.total),
      },
      top_product: { name: topProduct?.name, value: topProduct?.value },
      lowest_product: {
        name: lowestProduct?.name,
        value: lowestProduct?.value,
      },
    };

    const insights = {
      best_region: {
        name: ins.best_region,
        value: Number(ins.best_region_value),
      },
      worst_region: {
        name: ins.worst_region,
        value: Number(ins.worst_region_value),
      },
      weakest_territory: {
        name: ins.weakest_territory,
        value: Number(ins.weakest_territory_value),
      },
      top_customer: {
        name: ins.top_customer,
        value: Number(ins.top_customer_value),
      },
      lowest_customer: {
        name: ins.lowest_customer,
        value: Number(ins.lowest_customer_value),
      },
      most_sold_product: topProduct,
      least_sold_product: lowestProduct,
    };

    const deepInsights = {
      failures: {
        bottom5_tsm_tse: deepRow.bottom5_tsm || [],
        bottom5_asm_kam: deepRow.bottom5_asm || [],
        bottom5_territories: deepRow.bottom5_territories || [],
      },
      performers: {
        top5_customers: deepRow.top5_customers || [],
      },
      risks: {
        customer_concentration: {
          top5_pct: Number(deepRow.top5_pct),
          top10_pct: Number(deepRow.top10_pct),
          top20_pct: Number(deepRow.top20_pct),
          message: `Top 10 customers contribute ${deepRow.top10_pct}% of total revenue`,
        },
      },
    };

    // Process MTD vs Target
    const mtdPctOf = (numerator: number, denominator: number): number =>
      denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;

    const mtdRow = mtdTargetResult.rows[0];
    const mtdProducts = [
      {
        name: "Supercreate",
        mtd_sales: Number(mtdRow.plc_mtd_sales),
        target: Number(mtdRow.plc_target),
      },
      {
        name: "Supercreate+",
        mtd_sales: Number(mtdRow.plc_plus_mtd_sales),
        target: Number(mtdRow.plc_plus_target),
      },
      {
        name: "Powercrete",
        mtd_sales: Number(mtdRow.powercrete_mtd_sales),
        target: Number(mtdRow.powercrete_target),
      },
      {
        name: "Holcim",
        mtd_sales: Number(mtdRow.pcc_opc_mtd_sales),
        target: Number(mtdRow.pcc_opc_target),
      },
      {
        name: "HWP",
        mtd_sales: Number(mtdRow.hwp_mtd_sales),
        target: Number(mtdRow.hwp_target),
      },
      {
        name: "HCG",
        mtd_sales: Number(mtdRow.hcg_mtd_sales),
        target: Number(mtdRow.hcg_target),
      },
    ].map((p) => ({ ...p, achievement_pct: mtdPctOf(p.mtd_sales, p.target) }));

    const totalMtdSales = mtdProducts.reduce((s, p) => s + p.mtd_sales, 0);
    const totalTarget = mtdProducts.reduce((s, p) => s + p.target, 0);

    const mtdTarget = {
      total_mtd_sales: totalMtdSales,
      total_target: totalTarget,
      overall_achievement_pct: mtdPctOf(totalMtdSales, totalTarget),
      // Worst achievement first — same convention as the dashboard's
      // /api/sales/mtd-target-by-product endpoint.
      data: [...mtdProducts].sort(
        (a, b) => a.achievement_pct - b.achievement_pct,
      ),
    };

    // All areas — full list (no LIMIT), used for the "Area Performance"
    // section (all rows) and the written "Top 5 Areas" table that follows it.
    const allAreas = areaResult.rows.map((r: any) => ({
      area: r.area,
      asm_kam: r.asm_kam,
      customers: Number(r.customers),
      mtd_sales: Number(r.mtd_sales),
      d1_sales: Number(r.d1_sales),
    }));

    // RSM / Region report — group the flat rowset into 6 per-product
    // tables. `label` matches the naming already used for `products`
    // above; `colorKey` maps to PRODUCT_COLORS in the template (note the
    // SQL product tag and the brand color key don't always match 1:1 —
    // Powercrete -> POW, Holcim -> HOLCIM — so this table bridges them).
    //
    // Region display order: rows are re-sorted after fetching into the
    // fixed business order (see REGION_ORDER / sortByRegion above), the
    // same convention as salesController.ts's getRsmRegionReport, instead
    // of whatever order the SQL naturally groups them in.
    const RSM_PRODUCT_META: Record<
      string,
      { label: string; colorKey: string }
    > = {
      PLC: { label: "Supercrete", colorKey: "PLC" },
      "PLC+": { label: "Supercrete+", colorKey: "PLC+" },
      Powercrete: { label: "Powercrete", colorKey: "POW" },
      Holcim: { label: "Holcim", colorKey: "HOLCIM" },
      HWP: { label: "HWP", colorKey: "HWP" },
      HCG: { label: "HCG", colorKey: "HCG" },
    };

    const rsmByProduct = Object.entries(RSM_PRODUCT_META).map(
      ([key, meta]) => ({
        product: meta.label,
        colorKey: meta.colorKey,
        rows: sortByRegion(
          rsmReportResult.rows
            .filter((r: any) => r.product === key)
            .map((r: any) => ({
              region: r.region,
              rsm: r.rsm,
              target: Number(r.target_sum),
              mtd_target: Number(r.mtd_target),
              mtd_sales: Number(r.mtd_sales_sum),
              ach_mtd: Number(r.ach_mtd),
              todays_sales: Number(r.yesterday_sum),
              ach_today: Number(r.ach_today),
              per_day_req: Number(r.per_day_req),
              reg_per_day: Number(r.reg_per_day),
            })),
        ),
      }),
    );

    // D2R — appended as its own "product" entry, combined across all 6
    // products rather than split out per-product.
    rsmByProduct.push({
      product: "D2R",
      colorKey: "D2R",
      rows: sortByRegion(
        rsmReportD2RResult.rows.map((r: any) => ({
          region: r.region,
          rsm: r.rsm,
          target: Number(r.target_sum),
          mtd_target: Number(r.mtd_target),
          mtd_sales: Number(r.mtd_sales_sum),
          ach_mtd: Number(r.ach_mtd),
          todays_sales: Number(r.yesterday_sum),
          ach_today: Number(r.ach_today),
          per_day_req: Number(r.per_day_req),
          reg_per_day: Number(r.reg_per_day),
        })),
      ),
    });

    // Build HTML — pass charts so template can embed them
    const html = buildDashboardEmail({
      date,
      kpi,
      insights,
      byRegion: regionResult.rows.map((r: any) => ({
        region: r.region,
        plc: Number(r.plc_mtd_sales),
        plc_plus: Number(r.plc_plus_mtd_sales),
        pow: Number(r.powercrete_mtd_sales),
        holcim_ss: Number(r.pcc_opc_mtd_sales),
        hwp: Number(r.hwp_mtd_sales),
        hcg: Number(r.hcg_mtd_sales),
        total: Number(r.total),
      })),
      byProduct: products,
      deepInsights,
      mtdTarget,
      allAreas,
      rsmByProduct,
      charts: charts || [],
      dashboardUrl: process.env.FRONTEND_URL, // ← pass charts from frontend
    });

    // Build nodemailer attachments with cid: so they embed inline in the email
    // Defensive: strip a data URI prefix (e.g. "data:image/png;base64,")
    // if the frontend ever sends one — nodemailer's `content` needs raw
    // base64, and a stray prefix would silently corrupt every embedded chart.
    const attachments = (charts || []).map(
      (chart: { name: string; base64: string }) => ({
        filename: `${chart.name}.png`,
        content: chart.base64.replace(/^data:image\/\w+;base64,/, ""),
        encoding: "base64" as const,
        cid: chart.name, // matches src="cid:chart-name" in the HTML
      }),
    );

    // Send email
    await transporter.sendMail({
      from: `"Sales KPI Dashboard" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // send to self
      bcc: uniqueTo.join(", "), // all recipients hidden from each other
      cc: cc || "",
      subject: `Sales KPI Report — ${date}`,
      html,
      attachments,
    });

    res.json({ message: "Email sent successfully!", to: uniqueTo, date });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ error: "Failed to send email. Please try again." });
  }
};
