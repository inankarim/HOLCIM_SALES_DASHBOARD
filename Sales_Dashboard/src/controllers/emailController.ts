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
    const [
      kpiResult,
      regionResult,
      productResult,
      insightsResult,
      deepInsightsResult,
    ] = await Promise.all([
      // KPI
      pool.query(
        `
        SELECT
          SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total_sales,
          COUNT(DISTINCT customer_name) AS total_customers,
          COUNT(DISTINCT territory) AS total_territories,
          AVG(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS avg_per_customer
        FROM sales_current
        WHERE upload_date = $1
      `,
        [date],
      ),

      // By Region
      pool.query(
        `
        SELECT region,
          SUM(plc) AS plc, SUM(plc_plus) AS plc_plus,
          SUM(pow) AS pow, SUM(holcim_ss) AS holcim_ss,
          SUM(hwp) AS hwp, SUM(hcg) AS hcg,
          SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
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
          SUM(plc) AS plc, SUM(plc_plus) AS plc_plus,
          SUM(pow) AS pow, SUM(holcim_ss) AS holcim_ss,
          SUM(hwp) AS hwp, SUM(hcg) AS hcg,
          SUM(plc + plc_plus + pow + holcim_ss + hwp + hcg) AS total
        FROM sales_current
        WHERE upload_date = $1
      `,
        [date],
      ),

      // Insights
      pool.query(
        `
        SELECT
          (SELECT region FROM sales_current WHERE upload_date = $1
            GROUP BY region ORDER BY SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) DESC LIMIT 1) AS best_region,
          (SELECT SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) FROM sales_current WHERE upload_date = $1
            GROUP BY region ORDER BY SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) DESC LIMIT 1) AS best_region_value,
          (SELECT region FROM sales_current WHERE upload_date = $1
            GROUP BY region ORDER BY SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) ASC LIMIT 1) AS worst_region,
          (SELECT SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) FROM sales_current WHERE upload_date = $1
            GROUP BY region ORDER BY SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) ASC LIMIT 1) AS worst_region_value,
          (SELECT territory FROM sales_current WHERE upload_date = $1
            GROUP BY territory ORDER BY SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) ASC LIMIT 1) AS weakest_territory,
          (SELECT SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) FROM sales_current WHERE upload_date = $1
            GROUP BY territory ORDER BY SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) ASC LIMIT 1) AS weakest_territory_value,
          (SELECT customer_name FROM sales_current WHERE upload_date = $1
            GROUP BY customer_name ORDER BY SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) DESC LIMIT 1) AS top_customer,
          (SELECT SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) FROM sales_current WHERE upload_date = $1
            GROUP BY customer_name ORDER BY SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) DESC LIMIT 1) AS top_customer_value,
          (SELECT customer_name FROM sales_current WHERE upload_date = $1
            GROUP BY customer_name ORDER BY SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) ASC LIMIT 1) AS lowest_customer,
          (SELECT SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) FROM sales_current WHERE upload_date = $1
            GROUP BY customer_name ORDER BY SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) ASC LIMIT 1) AS lowest_customer_value
      `,
        [date],
      ),

      // Deep Insights
      pool.query(
        `
        WITH totals AS (
          SELECT SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) AS grand_total FROM sales_current WHERE upload_date = $1
        ),
        ranked_customers AS (
          SELECT customer_name, SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) AS total
          FROM sales_current WHERE upload_date = $1
          GROUP BY customer_name ORDER BY total DESC
        )
        SELECT
          (SELECT JSON_AGG(r) FROM (
            SELECT tsm_tse, COUNT(DISTINCT customer_name) AS customers,
              SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) AS total
            FROM sales_current WHERE upload_date = $1
            AND tsm_tse NOT ILIKE '%vacant%' AND tsm_tse != ''
            GROUP BY tsm_tse ORDER BY total ASC LIMIT 5
          ) r) AS bottom5_tsm,
          (SELECT JSON_AGG(r) FROM (
            SELECT asm_kam, COUNT(DISTINCT customer_name) AS customers,
              SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) AS total
            FROM sales_current WHERE upload_date = $1
            AND asm_kam != ''
            GROUP BY asm_kam ORDER BY total ASC LIMIT 5
          ) r) AS bottom5_asm,
          (SELECT JSON_AGG(r) FROM (
            SELECT territory, region, area,
              COUNT(DISTINCT customer_name) AS customers,
              SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) AS total
            FROM sales_current WHERE upload_date = $1
            GROUP BY territory, region, area ORDER BY total ASC LIMIT 5
          ) r) AS bottom5_territories,
          (SELECT JSON_AGG(r) FROM (
            SELECT customer_name, region, area, territory, tsm_tse,
              SUM(plc+plc_plus+pow+holcim_ss+hwp+hcg) AS total
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
    ]);

    // Process KPI
    const kpiRow = kpiResult.rows[0];
    const totalSales = Number(kpiRow.total_sales);

    // Process products
    const pRow = productResult.rows[0];
    const products = [
      { name: "Supercrete (PLC)", value: Number(pRow.plc) },
      { name: "Supercrete Plus (PLC+)", value: Number(pRow.plc_plus) },
      { name: "POW", value: Number(pRow.pow) },
      { name: "Holcim Strong Structure", value: Number(pRow.holcim_ss) },
      { name: "Holcim Water Protect", value: Number(pRow.hwp) },
      { name: "Holcim Coastal Guard", value: Number(pRow.hcg) },
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

    // Build HTML — pass charts so template can embed them
    const html = buildDashboardEmail({
      date,
      kpi,
      insights,
      byRegion: regionResult.rows.map((r: any) => ({
        region: r.region,
        plc: Number(r.plc),
        plc_plus: Number(r.plc_plus),
        pow: Number(r.pow),
        holcim_ss: Number(r.holcim_ss),
        hwp: Number(r.hwp),
        hcg: Number(r.hcg),
        total: Number(r.total),
      })),
      byProduct: products,
      deepInsights,
      charts: charts || [], // ← pass charts from frontend
    });

    // Build nodemailer attachments with cid: so they embed inline in the email
    const attachments = (charts || []).map(
      (chart: { name: string; base64: string }) => ({
        filename: `${chart.name}.png`,
        content: chart.base64,
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
