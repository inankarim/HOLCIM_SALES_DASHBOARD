import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { pool } from "../config/db";
import { transporter } from "../config/email";
import { buildDashboardEmail } from "../utils/emailTemplate";

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
    //   - *_mtd_sales / *_target: the true cumulative MTD-vs-target snapshot.
    //     Only the "MTD vs Target by product" query below is meant to read
    //     these columns directly.
    const [
      kpiResult,
      regionResult,
      productResult,
      insightsResult,
      deepInsightsResult,
      mtdTargetResult,
      areaResult,
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
          COUNT(DISTINCT customer_name) AS total_customers,
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
      // Same rule as Insights above — *_yesterday, never *_mtd_sales.
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
            SELECT tsm_tse, COUNT(DISTINCT customer_name) AS customers,
              SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) AS total
            FROM sales_current WHERE upload_date = $1
            AND tsm_tse NOT ILIKE '%vacant%' AND tsm_tse != ''
            GROUP BY tsm_tse ORDER BY total ASC LIMIT 5
          ) r) AS bottom5_tsm,
          (SELECT JSON_AGG(r) FROM (
            SELECT asm_kam, COUNT(DISTINCT customer_name) AS customers,
              SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) AS total
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
              SUM(plc_yesterday+plc_plus_yesterday+powercrete_yesterday+pcc_opc_yesterday+hwp_yesterday+hcg_yesterday) AS total
            FROM sales_current WHERE upload_date = $1
            GROUP BY customer_name, region, area, territory, tsm_tse
            ORDER BY total DESC LIMIT 5
          ) r) AS top5_customers,
          (SELECT ROUND(SUM(CASE WHEN rn <= 5 THEN total ELSE 0 END) / MAX(grand_total) * 100, 2)
            FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY total DESC) AS rn FROM ranked_customers) r
            CROSS JOIN totals) AS top5_pct,
          (SELECT ROUND(SUM(CASE WHEN rn <= 10 THEN total ELSE 0 END) / MAX(grand_total) * 100, 2)
            FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY total DESC) AS rn FROM ranked_customers) r
            CROSS JOIN totals) AS top10_pct,
          (SELECT ROUND(SUM(CASE WHEN rn <= 20 THEN total ELSE 0 END) / MAX(grand_total) * 100, 2)
            FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY total DESC) AS rn FROM ranked_customers) r
            CROSS JOIN totals) AS top20_pct,
          (SELECT grand_total FROM totals) AS grand_total
      `,
        [date],
      ),

      // MTD vs Target by product — new: this is what powers the
      // "MTD Target Achievement" section in the email.
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
      pool.query(
        `
        SELECT area, region,
          COUNT(DISTINCT customer_name) AS customers,
          SUM(plc_yesterday + plc_plus_yesterday + powercrete_yesterday + pcc_opc_yesterday + hwp_yesterday + hcg_yesterday) AS total
        FROM sales_current
        WHERE upload_date = $1
        GROUP BY area, region
        ORDER BY total DESC
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
        name: regionsSorted[regionsSorted.length - 1]?.region,
        value: Number(regionsSorted[regionsSorted.length - 1]?.total),
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
      region: r.region,
      customers: Number(r.customers),
      total: Number(r.total),
    }));

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
