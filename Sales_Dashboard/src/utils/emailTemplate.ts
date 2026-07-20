export function buildDashboardEmail(data: {
  date: string;
  kpi: any;
  insights: any;
  byRegion: any[];
  byProduct: any[];
  deepInsights: any;
  charts?: { name: string; base64: string }[];
  dashboardUrl?: string;
}): string {
  const {
    date,
    kpi,
    insights,
    byRegion,
    byProduct,
    deepInsights,
    charts = [],
    dashboardUrl,
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

  /**
   * Renders a single chart card.
   *
   * Design notes (fixes applied):
   * - Exactly ONE scroll container per chart (no nested overflow divs) — this
   *   was the cause of the double-scrollbar bug.
   * - Images default to width:100% / height:auto so they fit the card and
   *   are NOT artificially zoomed in. A scrollbar only appears if the chart
   *   has a genuinely wide natural size (set via `wide: true`), and even
   *   then the min-width is modest (640px) instead of the old 800–1000px,
   *   so it doesn't look blown up.
   * - `touch-action: pan-x pinch-zoom` lets people pinch-to-zoom on mobile
   *   without fighting the scroll container.
   * - DESKTOP FIX: `.chart-img--wide` now scales to fit the card on
   *   desktop (width:100%/max-width:100%) instead of forcing native
   *   pixel width. The old "wide" (min-width:100%, max-width:none)
   *   behavior only kicks back in inside a mobile-only media query,
   *   so phones keep the pinch/scroll UX while desktop no longer
   *   shows an oversized/clipped chart.
   */
  const renderChart = (
    chart: { name: string; base64: string } | undefined,
    opts?: { label?: string; emoji?: string; wide?: boolean; hint?: string },
  ) => {
    if (!chart) return "";
    const { label, emoji = "📈", wide = false, hint } = opts || {};
    const title = label || chart.name.replace(/[-_]/g, " ");

    return `
    <div class="chart-card">
      <div class="chart-title">${emoji} ${title}</div>
      ${hint ? `<div class="chart-hint mobile-only-hint">${hint}</div>` : ""}
      <div class="chart-scroll">
        <img
          src="cid:${chart.name}"
          alt="${title}"
          class="${wide ? "chart-img chart-img--wide" : "chart-img"}"
        />
      </div>
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

  const areaRows = (deepInsights?.failures?.bottom5_territories || [])
    .map(
      (r: any, i: number) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"}">
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;white-space:nowrap">${r.territory}</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;white-space:nowrap">${r.region}</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;text-align:center">${r.customers}</td>
        <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#1d4370;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${formatNum(Number(r.total))}</td>
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
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Sales KPI Report — ${date}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif }
    img { -ms-interpolation-mode:bicubic; }

    /* ---- chart card (single, consistent scroll container) ---- */
    .chart-card {
      background:white;
      border-radius:12px;
      border:1px solid #e2e8f0;
      padding:20px;
      margin-bottom:24px;
      box-shadow:0 1px 2px rgba(15,23,42,0.04);
    }
    .chart-title {
      font-size:14px;
      font-weight:700;
      color:#1e293b;
      margin-bottom:10px;
    }
    .chart-hint {
      font-size:11px;
      color:#64748b;
      background:#eff6ff;
      border:1px solid #bfdbfe;
      border-radius:6px;
      padding:6px 10px;
      margin-bottom:12px;
    }
    /* Hint text like "swipe / pinch to explore" is only relevant once
       the mobile media query below forces the wide-chart scroll
       behavior, so hide it by default and only show it on phones. */
    .mobile-only-hint { display:none; }

    /* the ONE and only scroll container per chart */
    .chart-scroll {
      overflow-x:auto;
      overflow-y:hidden;
      -webkit-overflow-scrolling:touch;
      scrollbar-width:thin;
      scrollbar-color:#cbd5e1 transparent;
      border-radius:8px;
      border:1px solid #e2e8f0;
      touch-action:pan-x pinch-zoom;
    }
    .chart-scroll::-webkit-scrollbar { height:8px; }
    .chart-scroll::-webkit-scrollbar-track { background:transparent; }
    .chart-scroll::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:8px; }
    .chart-scroll::-webkit-scrollbar-thumb:hover { background:#94a3b8; }

    /* default: image simply fits the card, no forced zoom */
    .chart-img {
      display:block;
      width:100%;
      max-width:100%;
      height:auto;
      border-radius:8px;
    }

    /* DESKTOP DEFAULT: wide charts (heatmap / ranking / area) now scale
       DOWN to fit the card's actual width, exactly like normal charts.
       Previously this rule forced min-width:100% + max-width:none,
       which locked the image to its native pixel size — on a roomy
       desktop window that meant the chart rendered oversized and got
       clipped/zoomed inside the card. This fixes that. */
    .chart-img--wide {
      display:block;
      width:100%;
      max-width:100%;
      min-width:0;
      height:auto;
      border-radius:8px;
    }

    /* MOBILE ONLY: flip wide charts back to a fixed min-width so the
       existing pinch/scroll UX on phones (which already looked right)
       is preserved unchanged. */
    @media screen and (max-width:640px) {
      .chart-img--wide {
        width:auto;
        min-width:640px;
        max-width:none;
      }
      .mobile-only-hint { display:block; }
    }

    table { border-collapse:collapse; }

    /* ---- dashboard CTA button ---- */
    .dashboard-btn {
      display:inline-block;
      background:#1D4370;
      color:#ffffff !important;
      font-size:13px;
      font-weight:600;
      text-decoration:none;
      padding:10px 20px;
      border-radius:8px;
      letter-spacing:0.02em;
    }

    /* ════════════════════════════════════════════════════════
       RESPONSIVE / MOBILE STYLES
       Most mail clients that matter on phones (Apple Mail,
       Outlook iOS/Android, the Gmail app on iOS, Yahoo, etc.)
       support @media queries, so we use them to reflow the
       fixed-width table layouts into single columns below
       640px instead of leaving everything tiny / squished.
       ════════════════════════════════════════════════════════ */
    @media screen and (max-width:640px) {
      .email-container { padding:16px 10px !important; }
      .email-header { padding:18px 16px !important; }
      .header-title { font-size:18px !important; }
      .header-table td { display:block !important; width:100% !important; text-align:left !important; }
      .header-table .header-meta-cell { text-align:left !important; margin-top:12px; }
      .header-table .header-meta-cell > div { margin-top:0 !important; }

      /* KPI cards: 2-up grid instead of 4-up */
      .kpi-cell {
        display:inline-block !important;
        width:48% !important;
        vertical-align:top !important;
        padding:4px !important;
      }
      .kpi-value { font-size:19px !important; }

      /* Section cards get tighter padding on phones */
      .section-card { padding:14px !important; }
      .section-title { font-size:14px !important; }

      /* Insight cards stack full-width */
      .insight-cell { display:block !important; width:100% !important; padding:4px 0 !important; }

      .chart-card { padding:14px !important; }
    }

    @media screen and (max-width:380px) {
      .kpi-cell { width:100% !important; }
    }
  </style>
</head>
<body>

  <!-- ═══ HEADER ═══ -->
  <div class="email-header" style="background:linear-gradient(to right,#94C12E,#10BBE1,#1D4370);padding:24px 32px">
    <table class="header-table" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="background:rgba(255,255,255,0.2);display:inline-block;padding:8px 14px;border-radius:8px">
            <span style="color:white;font-size:20px;font-weight:700">LafargeHolcim</span>
          </div>
          <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:6px">Sales KPI &amp; MIS Dashboard</div>
        </td>
        <td class="header-meta-cell" style="text-align:right">
          <div class="header-title" style="color:white;font-size:22px;font-weight:700">Sales Report</div>
          <div style="color:rgba(255,255,255,0.85);font-size:13px">${date}</div>
          ${
            dashboardUrl
              ? `<div style="margin-top:10px">
            <a href="${dashboardUrl}" class="dashboard-btn" target="_blank" rel="noopener noreferrer">View Full Dashboard →</a>
          </div>`
              : ""
          }
        </td>
      </tr>
    </table>
  </div>

  <div class="email-container" style="max-width:900px;margin:0 auto;padding:24px 16px">

    <!-- ═══ 1. KPI CARDS ═══ -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr>
        <td class="kpi-cell" width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #3b82f6">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Total Sales Volume</div>
            <div class="kpi-value" style="font-size:24px;font-weight:700;color:#3b82f6;margin-top:4px">${formatNum(kpi?.total_sales)}</div>
          </div>
        </td>
        <td class="kpi-cell" width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #06b6d4">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Total Customers</div>
            <div class="kpi-value" style="font-size:24px;font-weight:700;color:#06b6d4;margin-top:4px">${kpi?.total_customers?.toLocaleString()}</div>
          </div>
        </td>
        <td class="kpi-cell" width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #f59e0b">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Total Territories</div>
            <div class="kpi-value" style="font-size:24px;font-weight:700;color:#f59e0b;margin-top:4px">${kpi?.total_territories}</div>
          </div>
        </td>
        <td class="kpi-cell" width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #8b5cf6">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Avg / Customer</div>
            <div class="kpi-value" style="font-size:24px;font-weight:700;color:#8b5cf6;margin-top:4px">${formatNum(kpi?.avg_per_customer)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td class="kpi-cell" width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #10b981">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Top Region</div>
            <div style="font-size:18px;font-weight:700;color:#10b981;margin-top:4px">${kpi?.top_region?.name}</div>
            <div style="font-size:11px;color:#64748b">${formatNum(kpi?.top_region?.value)}</div>
          </div>
        </td>
        <td class="kpi-cell" width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #ef4444">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Lowest Region</div>
            <div style="font-size:18px;font-weight:700;color:#ef4444;margin-top:4px">${kpi?.lowest_region?.name}</div>
            <div style="font-size:11px;color:#64748b">${formatNum(kpi?.lowest_region?.value)}</div>
          </div>
        </td>
        <td class="kpi-cell" width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #10b981">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Top Product</div>
            <div style="font-size:18px;font-weight:700;color:#10b981;margin-top:4px">${kpi?.top_product?.name}</div>
            <div style="font-size:11px;color:#64748b">${formatNum(kpi?.top_product?.value)}</div>
          </div>
        </td>
        <td class="kpi-cell" width="25%" style="padding:4px">
          <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;border-left:4px solid #ef4444">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Lowest Product</div>
            <div style="font-size:18px;font-weight:700;color:#ef4444;margin-top:4px">${kpi?.lowest_product?.name}</div>
            <div style="font-size:11px;color:#64748b">${formatNum(kpi?.lowest_product?.value)}</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- ═══ 2. EXECUTIVE INSIGHTS ═══ -->
    <div class="section-card" style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
      <div class="section-title" style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:16px">💡 Executive Insights</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td class="insight-cell" width="50%" style="padding:4px">
            <div style="background:#f0fdf4;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e293b">
              ⭐ Best Region: <strong>${insights?.best_region?.name}</strong> — ${formatNum(insights?.best_region?.value)}
            </div>
          </td>
          <td class="insight-cell" width="50%" style="padding:4px">
            <div style="background:#fef2f2;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e293b">
              ⚠️ Weakest Territory: <strong>${insights?.weakest_territory?.name}</strong> — ${formatNum(insights?.weakest_territory?.value)}
            </div>
          </td>
        </tr>
        <tr>
          <td class="insight-cell" width="50%" style="padding:4px">
            <div style="background:#eff6ff;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e293b">
              📈 Top Customer: <strong>${insights?.top_customer?.name}</strong> — ${formatNum(insights?.top_customer?.value)}
            </div>
          </td>
          <td class="insight-cell" width="50%" style="padding:4px">
            <div style="background:#fefce8;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e293b">
              📉 Lowest Customer: <strong>${insights?.lowest_customer?.name}</strong> — ${formatNum(insights?.lowest_customer?.value)}
            </div>
          </td>
        </tr>
        <tr>
          <td class="insight-cell" width="50%" style="padding:4px">
            <div style="background:#f0fdf4;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e293b">
              🏆 Most Sold: <strong>${insights?.most_sold_product?.name}</strong> — ${formatNum(insights?.most_sold_product?.value)}
            </div>
          </td>
          <td class="insight-cell" width="50%" style="padding:4px">
            <div style="background:#fef2f2;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e293b">
              🔻 Least Sold: <strong>${insights?.least_sold_product?.name}</strong> — ${formatNum(insights?.least_sold_product?.value)}
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- ═══ 3. REGION PERFORMANCE TABLE ═══ -->
    <div class="section-card" style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:16px">
      <div class="section-title" style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:4px">📊 Region Performance</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:12px">Swipe left to see all columns →</div>
      <div class="chart-scroll" style="border:none">
        <table cellpadding="0" cellspacing="0" style="min-width:700px;width:100%">
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
    ${renderChart(regionChart, { label: "Region Performance Chart" })}

    <!-- ═══ 5. PRODUCT MIX TABLE ═══ -->
    <div class="section-card" style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:16px">
      <div class="section-title" style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">🥧 Product Mix</div>
      <div class="chart-scroll" style="border:none">
        <table cellpadding="0" cellspacing="0" style="width:100%;min-width:320px">
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
    ${renderChart(productPieChart, { label: "Product Mix Chart", emoji: "🥧" })}

    <!-- ═══ 7. PRODUCT COMPARISON CHART ═══ -->
    ${renderChart(productCompChart, { label: "Product Comparison" })}

    <!-- ═══ 8. HEATMAP (only one scrollbar, modest zoom) ═══ -->
    ${renderChart(heatmapChart, {
      label: "Territory Heatmap",
      emoji: "🔥",
      wide: true,
      hint: "👆 Swipe / pinch to explore the full heatmap",
    })}

    <!-- ═══ 9. AREA PERFORMANCE TABLE ═══ -->
    <div class="section-card" style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:16px">
      <div class="section-title" style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:4px">📍 Area Performance</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:12px">Swipe left to see all columns →</div>
      <div class="chart-scroll" style="border:none">
        <table cellpadding="0" cellspacing="0" style="width:100%;min-width:420px">
          <thead>
            <tr style="background:linear-gradient(to right,#94C12E,#10BBE1,#1D4370)">
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:left;white-space:nowrap">Territory</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:left;white-space:nowrap">Region</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:center;white-space:nowrap">Customers</th>
              <th style="padding:10px 14px;font-size:12px;font-weight:600;color:white;text-align:right;white-space:nowrap">Total Sales</th>
            </tr>
          </thead>
          <tbody>${areaRows}</tbody>
        </table>
      </div>
    </div>

    <!-- ═══ 10. AREA PERFORMANCE CHART ═══ -->
    ${renderChart(areaChart, {
      label: "Area Performance Chart",
      emoji: "📍",
      wide: true,
      hint: "👆 Swipe / pinch to see the full chart",
    })}

    <!-- ═══ 11. TERRITORY RANKING CHART ═══ -->
    ${renderChart(territoryChart, {
      label: "Territory Ranking",
      emoji: "🏅",
      wide: true,
      hint: "👆 Swipe / pinch to see all territories",
    })}

    <!-- ═══ 12. DEEP INSIGHTS — BOTTOM PERFORMERS ═══ -->
    <div class="section-card" style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
      <div class="section-title" style="font-size:15px;font-weight:700;color:#dc2626;margin-bottom:16px">⚠️ Bottom Performers</div>

      <div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;border-bottom:2px solid #fee2e2">Bottom 5 TSM / TSE</div>
      <div class="chart-scroll" style="border:none;margin-bottom:20px">
        <table cellpadding="0" cellspacing="0" style="width:100%;min-width:320px">
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
      <div class="chart-scroll" style="border:none;margin-bottom:20px">
        <table cellpadding="0" cellspacing="0" style="width:100%;min-width:320px">
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
      <div class="chart-scroll" style="border:none">
        <table cellpadding="0" cellspacing="0" style="width:100%;min-width:380px">
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
    <div class="section-card" style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:20px;margin-bottom:24px">
      <div class="section-title" style="font-size:15px;font-weight:700;color:#16a34a;margin-bottom:16px">🏆 Top 5 Customers</div>
      <div class="chart-scroll" style="border:none">
        <table cellpadding="0" cellspacing="0" style="width:100%;min-width:380px">
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
