export function buildDashboardEmail(data: {
  date: string;
  kpi: any;
  insights: any;
  byRegion: any[];
  byProduct: any[];
  deepInsights: any;
  charts?: { name: string; base64: string }[];
}): string {
  const {
    date,
    kpi,
    insights,
    byRegion,
    byProduct,
    deepInsights,
    charts = [],
  } = data;

  const formatNum = (val: number): string => {
    if (!val) return "0";
    if (val >= 1000000) return (val / 1000000).toFixed(2) + "M MT";
    if (val >= 1000) return (val / 1000).toFixed(2) + "K MT";
    return val.toLocaleString() + " MT";
  };

  // Helper: find chart by name keyword
  const getChart = (keyword: string) =>
    charts.find((c) => c.name.toLowerCase().includes(keyword.toLowerCase()));

  const renderChart = (
    chart: { name: string; base64: string } | undefined,
    label?: string,
  ) => {
    if (!chart) return "";
    const title = label || chart.name.replace(/-/g, " ").replace(/_/g, " ");
    return `
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
      <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.04em">📈 ${title}</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px;border:1px solid #e2e8f0">
        <div style="min-width:560px">
          <img
            src="cid:${chart.name}"
            alt="${title}"
            style="width:100%;min-width:560px;max-width:900px;height:auto;display:block;border-radius:8px"
          />
        </div>
      </div>
      <div style="font-size:10px;color:#94a3b8;margin-top:6px;text-align:right">← Scroll horizontally if needed</div>
    </div>`;
  };

  const regionRows = byRegion
    .sort((a, b) => b.total - a.total)
    .map(
      (r, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"}">
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;white-space:nowrap">${r.region}</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${formatNum(r.plc)}</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${formatNum(r.plc_plus)}</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${formatNum(r.pow)}</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${formatNum(r.holcim_ss)}</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${formatNum(r.hwp)}</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${formatNum(r.hcg)}</td>
        <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#1d4370;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${formatNum(r.total)}</td>
      </tr>`,
    )
    .join("");

  const productRows = byProduct
    .sort((a, b) => b.value - a.value)
    .map(
      (p, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"}">
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;white-space:nowrap">${p.name}</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${formatNum(p.value)}</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${p.pct?.toFixed(1)}%</td>
      </tr>`,
    )
    .join("");

  const bottom5TsmRows = (deepInsights?.failures?.bottom5_tsm_tse || [])
    .map(
      (r: any, i: number) => `
      <tr style="background:${i % 2 === 0 ? "#fff5f5" : "#ffffff"}">
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid #fee2e2">${r.tsm_tse}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid #fee2e2;text-align:center">${r.customers}</td>
        <td style="padding:8px 12px;font-size:12px;color:#dc2626;font-weight:700;border-bottom:1px solid #fee2e2;text-align:right">${formatNum(Number(r.total))}</td>
      </tr>`,
    )
    .join("");

  const bottom5AsmRows = (deepInsights?.failures?.bottom5_asm_kam || [])
    .map(
      (r: any, i: number) => `
      <tr style="background:${i % 2 === 0 ? "#fff5f5" : "#ffffff"}">
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid #fee2e2">${r.asm_kam}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid #fee2e2;text-align:center">${r.customers}</td>
        <td style="padding:8px 12px;font-size:12px;color:#dc2626;font-weight:700;border-bottom:1px solid #fee2e2;text-align:right">${formatNum(Number(r.total))}</td>
      </tr>`,
    )
    .join("");

  const bottom5TerRows = (deepInsights?.failures?.bottom5_territories || [])
    .map(
      (r: any, i: number) => `
      <tr style="background:${i % 2 === 0 ? "#fff5f5" : "#ffffff"}">
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid #fee2e2">${r.territory}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid #fee2e2">${r.region}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid #fee2e2;text-align:center">${r.customers}</td>
        <td style="padding:8px 12px;font-size:12px;color:#dc2626;font-weight:700;border-bottom:1px solid #fee2e2;text-align:right">${formatNum(Number(r.total))}</td>
      </tr>`,
    )
    .join("");

  const top5CustomerRows = (deepInsights?.performers?.top5_customers || [])
    .map(
      (r: any, i: number) => `
      <tr style="background:${i % 2 === 0 ? "#f0fdf4" : "#ffffff"}">
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid #bbf7d0">${r.customer_name}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid #bbf7d0">${r.region}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid #bbf7d0">${r.territory}</td>
        <td style="padding:8px 12px;font-size:12px;color:#16a34a;font-weight:700;border-bottom:1px solid #bbf7d0;text-align:right">${formatNum(Number(r.total))}</td>
      </tr>`,
    )
    .join("");

  // Chart lookups — adjust keywords to match your actual chart names
  const regionChart = getChart("region");
  const productPieChart =
    getChart("product") || getChart("pie") || getChart("mix");
  const productCompChart = getChart("comparison") || getChart("compare");
  const heatmapChart = getChart("heatmap") || getChart("heat");
  const areaChart = getChart("area");
  const territoryChart = getChart("territory") || getChart("ranking");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sales KPI Report — ${date}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif }
    .scroll-hint { font-size:10px;color:#94a3b8;margin-top:6px;text-align:right;display:block }
  </style>
</head>
<body>

  <!-- ═══ HEADER ═══ -->
  <div style="background:linear-gradient(to right,#94C12E,#10BBE1,#1D4370);padding:24px 32px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="background:rgba(255,255,255,0.2);display:inline-block;padding:8px 14px;border-radius:8px">
            <span style="color:white;font-size:20px;font-weight:700">LafargeHolcim</span>
          </div>
          <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:6px">Sales KPI &amp; MIS Dashboard</div>
        </td>
        <td style="text-align:right">
          <div style="color:white;font-size:22px;font-weight:700">Sales Report</div>
          <div style="color:rgba(255,255,255,0.85);font-size:13px">${date}</div>
        </td>
      </tr>
    </table>
  </div>

  <div style="max-width:900px;margin:0 auto;padding:24px 16px">

    <!-- ═══ 1. KPI CARDS ═══ -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr>
        <td width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #3b82f6">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Total Sales Volume</div>
            <div style="font-size:24px;font-weight:700;color:#3b82f6;margin-top:4px">${formatNum(kpi?.total_sales)}</div>
          </div>
        </td>
        <td width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #06b6d4">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Total Customers</div>
            <div style="font-size:24px;font-weight:700;color:#06b6d4;margin-top:4px">${kpi?.total_customers?.toLocaleString()}</div>
          </div>
        </td>
        <td width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #f59e0b">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Total Territories</div>
            <div style="font-size:24px;font-weight:700;color:#f59e0b;margin-top:4px">${kpi?.total_territories}</div>
          </div>
        </td>
        <td width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #8b5cf6">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Avg / Customer</div>
            <div style="font-size:24px;font-weight:700;color:#8b5cf6;margin-top:4px">${formatNum(kpi?.avg_per_customer)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #10b981">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Top Region</div>
            <div style="font-size:18px;font-weight:700;color:#10b981;margin-top:4px">${kpi?.top_region?.name}</div>
            <div style="font-size:11px;color:#64748b">${formatNum(kpi?.top_region?.value)}</div>
          </div>
        </td>
        <td width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #ef4444">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Lowest Region</div>
            <div style="font-size:18px;font-weight:700;color:#ef4444;margin-top:4px">${kpi?.lowest_region?.name}</div>
            <div style="font-size:11px;color:#64748b">${formatNum(kpi?.lowest_region?.value)}</div>
          </div>
        </td>
        <td width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #10b981">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Top Product</div>
            <div style="font-size:18px;font-weight:700;color:#10b981;margin-top:4px">${kpi?.top_product?.name}</div>
            <div style="font-size:11px;color:#64748b">${formatNum(kpi?.top_product?.value)}</div>
          </div>
        </td>
        <td width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #ef4444">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Lowest Product</div>
            <div style="font-size:18px;font-weight:700;color:#ef4444;margin-top:4px">${kpi?.lowest_product?.name}</div>
            <div style="font-size:11px;color:#64748b">${formatNum(kpi?.lowest_product?.value)}</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- ═══ 2. EXECUTIVE INSIGHTS ═══ -->
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:16px">💡 Executive Insights</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" style="padding:4px">
            <div style="background:#f0fdf4;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e293b">
              ⭐ Best Region: <strong>${insights?.best_region?.name}</strong> — ${formatNum(insights?.best_region?.value)}
            </div>
          </td>
          <td width="50%" style="padding:4px">
            <div style="background:#fef2f2;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e293b">
              ⚠️ Weakest Territory: <strong>${insights?.weakest_territory?.name}</strong> — ${formatNum(insights?.weakest_territory?.value)}
            </div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:4px">
            <div style="background:#eff6ff;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e293b">
              📈 Top Customer: <strong>${insights?.top_customer?.name}</strong> — ${formatNum(insights?.top_customer?.value)}
            </div>
          </td>
          <td width="50%" style="padding:4px">
            <div style="background:#fefce8;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e293b">
              📉 Lowest Customer: <strong>${insights?.lowest_customer?.name}</strong> — ${formatNum(insights?.lowest_customer?.value)}
            </div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:4px">
            <div style="background:#f0fdf4;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e293b">
              🏆 Most Sold: <strong>${insights?.most_sold_product?.name}</strong> — ${formatNum(insights?.most_sold_product?.value)}
            </div>
          </td>
          <td width="50%" style="padding:4px">
            <div style="background:#fef2f2;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e293b">
              🔻 Least Sold: <strong>${insights?.least_sold_product?.name}</strong> — ${formatNum(insights?.least_sold_product?.value)}
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- ═══ 3. REGION PERFORMANCE TABLE ═══ -->
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:16px">
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:4px">📊 Region Performance</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:12px">Swipe left to see all columns →</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:700px;width:100%">
          <thead>
            <tr style="background:linear-gradient(to right,#94C12E,#10BBE1,#1D4370)">
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:left;white-space:nowrap">Region</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:right;white-space:nowrap">Supercrete</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:right;white-space:nowrap">Supercrete+</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:right;white-space:nowrap">POW</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:right;white-space:nowrap">Holcim SS</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:right;white-space:nowrap">HWP</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:right;white-space:nowrap">HCG</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:right;white-space:nowrap">Total</th>
            </tr>
          </thead>
          <tbody>${regionRows}</tbody>
        </table>
      </div>
    </div>

    <!-- ═══ 4. REGION PERFORMANCE CHART ═══ -->
    ${
      regionChart
        ? `
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
      <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:12px">📈 Region Performance Chart</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px;border:1px solid #e2e8f0">
        <img
          src="cid:${regionChart.name}"
          alt="Region Performance Chart"
          style="width:100%;min-width:560px;max-width:900px;height:auto;display:block;border-radius:8px"
        />
      </div>
      <span style="font-size:10px;color:#94a3b8;margin-top:6px;display:block;text-align:right">← Scroll horizontally if needed</span>
    </div>`
        : ""
    }

    <!-- ═══ 5. PRODUCT MIX TABLE ═══ -->
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:16px">
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">🥧 Product Mix</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;min-width:320px">
          <thead>
            <tr style="background:linear-gradient(to right,#94C12E,#10BBE1,#1D4370)">
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:left;white-space:nowrap">Product</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:right;white-space:nowrap">Volume</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:right;white-space:nowrap">% Share</th>
            </tr>
          </thead>
          <tbody>${productRows}</tbody>
        </table>
      </div>
    </div>

    <!-- ═══ 6. PRODUCT MIX PIE CHART ═══ -->
    ${
      productPieChart
        ? `
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
      <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:12px">🥧 Product Mix Chart</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px;border:1px solid #e2e8f0">
        <img
          src="cid:${productPieChart.name}"
          alt="Product Mix Chart"
          style="width:100%;min-width:400px;max-width:900px;height:auto;display:block;border-radius:8px"
        />
      </div>
      <span style="font-size:10px;color:#94a3b8;margin-top:6px;display:block;text-align:right">← Scroll horizontally if needed</span>
    </div>`
        : ""
    }

    <!-- ═══ 7. PRODUCT COMPARISON TABLE ═══ -->
    ${
      productCompChart
        ? `
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:16px">
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">📊 Product Comparison</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px;border:1px solid #e2e8f0">
        <img
          src="cid:${productCompChart.name}"
          alt="Product Comparison"
          style="width:100%;min-width:560px;max-width:900px;height:auto;display:block;border-radius:8px"
        />
      </div>
      <span style="font-size:10px;color:#94a3b8;margin-top:6px;display:block;text-align:right">← Scroll horizontally if needed</span>
    </div>`
        : ""
    }

    <!-- ═══ 8. HEATMAP (horizontal scroll / swipe) ═══ -->
    ${
      heatmapChart
        ? `
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
      <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:4px">🔥 Territory Heatmap</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:12px;background:#fefce8;padding:6px 10px;border-radius:6px;border:1px solid #fde68a">
        👆 Swipe left / right to explore the full heatmap
      </div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px;border:1px solid #e2e8f0">
        <div style="min-width:800px">
          <img
            src="cid:${heatmapChart.name}"
            alt="Territory Heatmap"
            style="width:100%;min-width:800px;height:auto;display:block;border-radius:8px"
          />
        </div>
      </div>
      <span style="font-size:10px;color:#94a3b8;margin-top:6px;display:block;text-align:right">← Swipe left to see full heatmap</span>
    </div>`
        : ""
    }

    <!-- ═══ 9. AREA PERFORMANCE TABLE ═══ -->
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:16px">
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:4px">📍 Area Performance</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:12px">Swipe left to see all columns →</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;min-width:420px">
          <thead>
            <tr style="background:linear-gradient(to right,#94C12E,#10BBE1,#1D4370)">
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:left;white-space:nowrap">Territory</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:left;white-space:nowrap">Region</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:center;white-space:nowrap">Customers</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:right;white-space:nowrap">Total Sales</th>
            </tr>
          </thead>
          <tbody>
            ${(deepInsights?.failures?.bottom5_territories || [])
              .map(
                (r: any, i: number) => `
              <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"}">
                <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;white-space:nowrap">${r.territory}</td>
                <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;white-space:nowrap">${r.region}</td>
                <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;text-align:center">${r.customers}</td>
                <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#1d4370;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${formatNum(Number(r.total))}</td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>

    <!-- ═══ 10. AREA PERFORMANCE CHART ═══ -->
   <!-- ═══ 10. AREA PERFORMANCE CHART ═══ -->
    ${
      areaChart
        ? `
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
      <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:4px">📍 Area Performance Chart</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:12px;background:#eff6ff;padding:6px 10px;border-radius:6px;border:1px solid #bfdbfe">
        👆 Swipe left/right to see full chart
      </div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px;border:1px solid #e2e8f0">
        <div style="min-width:1000px">
          <img
            src="cid:${areaChart.name}"
            alt="Area Performance Chart"
            style="width:1000px;height:auto;display:block;border-radius:8px"
          />
        </div>
      </div>
      <span style="font-size:10px;color:#94a3b8;margin-top:6px;display:block;text-align:right">← Swipe left to see full chart</span>
    </div>`
        : ""
    }

    <!-- ═══ 11. TERRITORY RANKING CHART (zoom / swipe) ═══ -->
    ${
      territoryChart
        ? `
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
      <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:4px">🏅 Territory Ranking</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:12px;background:#eff6ff;padding:6px 10px;border-radius:6px;border:1px solid #bfdbfe">
        👆 Swipe left/right to see all territories — chart is zoomed for clarity
      </div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px;border:1px solid #e2e8f0">
        <div style="min-width:1000px">
          <img
            src="cid:${territoryChart.name}"
            alt="Territory Ranking Chart"
            style="width:1000px;height:auto;display:block;border-radius:8px"
          />
        </div>
      </div>
      <span style="font-size:10px;color:#94a3b8;margin-top:6px;display:block;text-align:right">← Swipe left to see full ranking</span>
    </div>`
        : ""
    }

    <!-- ═══ 12. DEEP INSIGHTS — BOTTOM PERFORMERS ═══ -->
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
      <div style="font-size:15px;font-weight:700;color:#dc2626;margin-bottom:16px">⚠️ Bottom Performers</div>

      <div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;border-bottom:2px solid #fee2e2">Bottom 5 TSM / TSE</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:20px">
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;min-width:320px">
          <thead>
            <tr style="background:#fef2f2">
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#dc2626;text-align:left;border-bottom:1px solid #fee2e2">TSM/TSE</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#dc2626;text-align:center;border-bottom:1px solid #fee2e2">Customers</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#dc2626;text-align:right;border-bottom:1px solid #fee2e2">Total Sales</th>
            </tr>
          </thead>
          <tbody>${bottom5TsmRows}</tbody>
        </table>
      </div>

      <div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;border-bottom:2px solid #fee2e2">Bottom 5 ASM / KAM</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:20px">
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;min-width:320px">
          <thead>
            <tr style="background:#fef2f2">
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#dc2626;text-align:left;border-bottom:1px solid #fee2e2">ASM/KAM</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#dc2626;text-align:center;border-bottom:1px solid #fee2e2">Customers</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#dc2626;text-align:right;border-bottom:1px solid #fee2e2">Total Sales</th>
            </tr>
          </thead>
          <tbody>${bottom5AsmRows}</tbody>
        </table>
      </div>

      <div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;border-bottom:2px solid #fee2e2">Bottom 5 Territories</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;min-width:380px">
          <thead>
            <tr style="background:#fef2f2">
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#dc2626;text-align:left;border-bottom:1px solid #fee2e2">Territory</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#dc2626;text-align:left;border-bottom:1px solid #fee2e2">Region</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#dc2626;text-align:center;border-bottom:1px solid #fee2e2">Customers</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#dc2626;text-align:right;border-bottom:1px solid #fee2e2">Total Sales</th>
            </tr>
          </thead>
          <tbody>${bottom5TerRows}</tbody>
        </table>
      </div>
    </div>

    <!-- ═══ 13. TOP CUSTOMERS ═══ -->
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
      <div style="font-size:15px;font-weight:700;color:#16a34a;margin-bottom:16px">🏆 Top 5 Customers</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;min-width:380px">
          <thead>
            <tr style="background:#f0fdf4">
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#16a34a;text-align:left;border-bottom:1px solid #bbf7d0;white-space:nowrap">Customer</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#16a34a;text-align:left;border-bottom:1px solid #bbf7d0;white-space:nowrap">Region</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#16a34a;text-align:left;border-bottom:1px solid #bbf7d0;white-space:nowrap">Territory</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#16a34a;text-align:right;border-bottom:1px solid #bbf7d0;white-space:nowrap">Total Sales</th>
            </tr>
          </thead>
          <tbody>${top5CustomerRows}</tbody>
        </table>
      </div>
    </div>

    <!-- ═══ FOOTER ═══ -->
    <div style="text-align:center;padding:24px;color:#94a3b8;font-size:11px">
      <div style="font-weight:600;color:#475569;margin-bottom:4px">LafargeHolcim Bangladesh PLC</div>
      <div>NinaKabbo, Level-7, 227/A, Bir Uttam Mir Shawkat Sarak, Tejgaon, Dhaka-1208</div>
      <div style="margin-top:4px">
        <a href="https://www.lafargeholcim.com.bd" style="color:#1D4370;text-decoration:none">www.lafargeholcim.com.bd</a>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0">
        Generated by Sales KPI Dashboard — ${date}
      </div>
    </div>

  </div>
</body>
</html>
  `;
}
