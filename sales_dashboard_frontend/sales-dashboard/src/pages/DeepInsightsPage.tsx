import { useEffect, useState } from "react";
import { salesApi } from "../api/salesApi";
import { Card, CardContent, CardHeader} from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { formatNumber } from "../lib/formatNumber";
import {
  AlertTriangle,
  TrendingUp,
  Shield,
  Zap,
  ImageDown,
} from "lucide-react";
import { exportChartToPng } from "../lib/exportPng";
import type { FilterParams } from "../api/salesApi";

const COLORS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#06b6d4","#ec4899","#84cc16",
];

interface Props {
  filters: FilterParams;
}

function SectionTitle({ icon: Icon, title, color }: { icon: any; title: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 text-base font-bold ${color}`}>
      <Icon className="h-5 w-5" />
      {title}
    </div>
  );
}

function DataTable({ columns, rows }: { 
  columns: { key: string; label: string; format?: (v: any, row: any) => string }[]; 
  rows: any[] 
}) {
  if (!rows.length) return (
    <p className="text-xs text-muted-foreground py-2">No data available.</p>
  );
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className="text-xs">{c.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c.key} className="text-xs">
                  {c.format ? c.format(row[c.key], row) : row[c.key] ?? "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DeepInsightsPage({ filters }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    salesApi
      .getDeepInsights(filters)
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load deep insights"))
      .finally(() => setLoading(false));
  }, [filters]);

  const exportTablePng = (id: string, filename: string) => {
    const el = document.getElementById(id);
    if (el) exportChartToPng(el, filename);
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-destructive">{error}</div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold">Deep Insights</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {data.date_used ? `Date: ${data.date_used}` : "Latest available data"}
        </p>
      </div>

      {/* ── FAILURES + PERFORMERS SIDE BY SIDE ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <SectionTitle icon={AlertTriangle} title="Failures" color="text-red-500" />
            <SectionTitle icon={TrendingUp} title="Top Performers" color="text-green-500" />
          </div>
        </CardHeader>
        <CardContent className="space-y-8">

          {/* TSM/TSE */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">TSM/TSE</h3>
            <div className="grid grid-cols-2 gap-4">
              <div id="chart-bottom5-tsm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-red-500">▼ Bottom 5</p>
                  <button
                    onClick={() => exportTablePng("chart-bottom5-tsm", "Bottom-5-TSM-TSE.png")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ImageDown className="h-3 w-3" /> PNG
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "tsm_tse", label: "TSM/TSE" },
                    { key: "customers", label: "Customers" },
                    { key: "total", label: "Total Sales", format: formatNumber },
                  ]}
                  rows={data.failures.bottom5_tsm_tse}
                />
              </div>
              <div id="chart-top5-tsm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-green-500">▲ Top 5</p>
                  <button
                    onClick={() => exportTablePng("chart-top5-tsm", "Top-5-TSM-TSE.png")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ImageDown className="h-3 w-3" /> PNG
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "tsm_tse", label: "TSM/TSE" },
                    { key: "customers", label: "Customers" },
                    { key: "total", label: "Total Sales", format: formatNumber },
                  ]}
                  rows={data.performers.top5_tsm_tse}
                />
              </div>
            </div>
          </div>

          <div className="border-t" />

          {/* ASM/KAM */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">ASM/KAM</h3>
            <div className="grid grid-cols-2 gap-4">
              <div id="chart-bottom5-asm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-red-500">▼ Bottom 5</p>
                  <button
                    onClick={() => exportTablePng("chart-bottom5-asm", "Bottom-5-ASM-KAM.png")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ImageDown className="h-3 w-3" /> PNG
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "asm_kam", label: "ASM/KAM" },
                    { key: "customers", label: "Customers" },
                    { key: "total", label: "Total Sales", format: formatNumber },
                  ]}
                  rows={data.failures.bottom5_asm_kam}
                />
              </div>
              <div id="chart-top5-asm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-green-500">▲ Top 5</p>
                  <button
                    onClick={() => exportTablePng("chart-top5-asm", "Top-5-ASM-KAM.png")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ImageDown className="h-3 w-3" /> PNG
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "asm_kam", label: "ASM/KAM" },
                    { key: "customers", label: "Customers" },
                    { key: "total", label: "Total Sales", format: formatNumber },
                  ]}
                  rows={data.performers.top5_asm_kam}
                />
              </div>
            </div>
          </div>

          <div className="border-t" />

          {/* RSM/B2B Head */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">RSM/B2B Head</h3>
            <div className="grid grid-cols-2 gap-4">
              <div id="chart-bottom5-rsm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-red-500">▼ Bottom 5</p>
                  <button
                    onClick={() => exportTablePng("chart-bottom5-rsm", "Bottom-5-RSM-B2B-Head.png")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ImageDown className="h-3 w-3" /> PNG
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "rsm_b2b_head", label: "RSM/B2B Head" },
                    { key: "customers", label: "Customers" },
                    { key: "total", label: "Total Sales", format: formatNumber },
                  ]}
                  rows={data.failures.bottom5_rsm}
                />
              </div>
              <div id="chart-top5-rsm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-green-500">▲ Top 5</p>
                  <button
                    onClick={() => exportTablePng("chart-top5-rsm", "Top-5-RSM-B2B-Head.png")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ImageDown className="h-3 w-3" /> PNG
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "rsm_b2b_head", label: "RSM/B2B Head" },
                    { key: "customers", label: "Customers" },
                    { key: "total", label: "Total Sales", format: formatNumber },
                  ]}
                  rows={data.performers.top5_rsm}
                />
              </div>
            </div>
          </div>

          <div className="border-t" />

          {/* Customers */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Customers</h3>
            <div className="grid grid-cols-2 gap-4">
              <div id="chart-bottom5-customers">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-red-500">▼ Bottom 5</p>
                  <button
                    onClick={() => exportTablePng("chart-bottom5-customers", "Bottom-5-Customers-Deep.png")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ImageDown className="h-3 w-3" /> PNG
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "customer_name", label: "Customer" },
                    { key: "region", label: "Region" },
                    { key: "territory", label: "Territory" },
                    { key: "tsm_tse", label: "TSM/TSE" },
                    { key: "total", label: "Total Sales", format: formatNumber },
                  ]}
                  rows={data.failures.bottom5_customers}
                />
              </div>
              <div id="chart-top5-customers">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-green-500">▲ Top 5</p>
                  <button
                    onClick={() => exportTablePng("chart-top5-customers", "Top-5-Customers-Deep.png")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ImageDown className="h-3 w-3" /> PNG
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "customer_name", label: "Customer" },
                    { key: "region", label: "Region" },
                    { key: "territory", label: "Territory" },
                    { key: "tsm_tse", label: "TSM/TSE" },
                    { key: "total", label: "Total Sales", format: formatNumber },
                  ]}
                  rows={data.performers.top5_customers}
                />
              </div>
            </div>
          </div>

          <div className="border-t" />

          {/* Territories */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Territories</h3>
            <div className="grid grid-cols-2 gap-4">
              <div id="chart-bottom5-territories">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-red-500">▼ Bottom 5</p>
                  <button
                    onClick={() => exportTablePng("chart-bottom5-territories", "Bottom-5-Territories.png")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ImageDown className="h-3 w-3" /> PNG
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "territory", label: "Territory" },
                    { key: "region", label: "Region" },
                    { key: "area", label: "Area" },
                    { key: "customers", label: "Customers" },
                    { key: "total", label: "Total Sales", format: formatNumber },
                  ]}
                  rows={data.failures.bottom5_territories}
                />
              </div>
              <div id="chart-top5-territories">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-green-500">▲ Top 5</p>
                  <button
                    onClick={() => exportTablePng("chart-top5-territories", "Top-5-Territories.png")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ImageDown className="h-3 w-3" /> PNG
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "territory", label: "Territory" },
                    { key: "region", label: "Region" },
                    { key: "area", label: "Area" },
                    { key: "customers", label: "Customers" },
                    { key: "total", label: "Total Sales", format: formatNumber },
                  ]}
                  rows={data.performers.top5_territories}
                />
              </div>
            </div>
          </div>

          <div className="border-t" />

          {/* Vacant TSM Territories */}
          <div id="chart-vacant-tsm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">
                Vacant TSM Territories ({data.failures.vacant_tsm_territories.count})
              </h3>
              <button
                onClick={() => exportTablePng("chart-vacant-tsm", "Vacant-TSM-Territories.png")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ImageDown className="h-3 w-3" /> PNG
              </button>
            </div>
            <DataTable
              columns={[
                { key: "territory", label: "Territory" },
                { key: "region", label: "Region" },
                { key: "area", label: "Area" },
                { key: "customers", label: "Customers" },
                { key: "total", label: "Total Sales", format: formatNumber },
              ]}
              rows={data.failures.vacant_tsm_territories.data}
            />
          </div>

          {/* Low Sales Customers */}
          <div id="chart-low-sales">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">
                Low Sales Customers ({data.failures.low_sales_customers.count})
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  Below {formatNumber(data.failures.low_sales_customers.threshold)} threshold
                </span>
              </h3>
              <button
                onClick={() => exportTablePng("chart-low-sales", "Low-Sales-Customers.png")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ImageDown className="h-3 w-3" /> PNG
              </button>
            </div>
            <DataTable
              columns={[
                { key: "customer_name", label: "Customer" },
                { key: "region", label: "Region" },
                { key: "territory", label: "Territory" },
                { key: "tsm_tse", label: "TSM/TSE" },
                { key: "total", label: "Total Sales", format: formatNumber },
              ]}
              rows={data.failures.low_sales_customers.data}
            />
          </div>

        </CardContent>
      </Card>

      {/* ── OPPORTUNITIES ── */}
      <Card>
        <CardHeader>
          <SectionTitle icon={TrendingUp} title="Opportunities" color="text-green-500" />
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Single Product Customers */}
          <div id="chart-single-product">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold">
                Single Product Customers — Upsell Targets ({data.opportunities.single_product_customers.count})
              </h3>
              <button
                onClick={() => exportTablePng("chart-single-product", "Single-Product-Customers.png")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ImageDown className="h-3 w-3" /> PNG
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {data.opportunities.single_product_customers.message}
            </p>
            <DataTable
              columns={[
                { key: "customer_name", label: "Customer" },
                { key: "region", label: "Region" },
                { key: "territory", label: "Territory" },
                { key: "tsm_tse", label: "TSM/TSE" },
                { key: "products_buying", label: "Products" },
                { key: "total", label: "Total Sales", format: formatNumber },
              ]}
              rows={data.opportunities.single_product_customers.data}
            />
          </div>

          {/* Below Average Territories */}
          <div id="chart-below-avg-territories">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">
                Below Average Territories ({data.opportunities.below_avg_territories.count})
              </h3>
              <button
                onClick={() => exportTablePng("chart-below-avg-territories", "Below-Average-Territories.png")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ImageDown className="h-3 w-3" /> PNG
              </button>
            </div>
            <DataTable
              columns={[
                { key: "territory", label: "Territory" },
                { key: "region", label: "Region" },
                { key: "area", label: "Area" },
                { key: "customers", label: "Customers" },
                { key: "total", label: "Total Sales", format: formatNumber },
                { key: "pct_below_avg", label: "% Below Avg", format: (v) => `${v}%` },
              ]}
              rows={data.opportunities.below_avg_territories.data}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── RISKS ── */}
      <Card>
        <CardHeader>
          <SectionTitle icon={Shield} title="Risks" color="text-yellow-500" />
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Customer Concentration */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Customer Concentration Risk</h3>
            <p className="text-xs text-muted-foreground mb-3">
              {data.risks.customer_concentration.message}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Top 5 customers", value: data.risks.customer_concentration.top5_pct },
                { label: "Top 10 customers", value: data.risks.customer_concentration.top10_pct },
                { label: "Top 20 customers", value: data.risks.customer_concentration.top20_pct },
              ].map((item, i) => (
                <div key={i} className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${item.value > 50 ? "text-red-500" : "text-green-500"}`}>
                    {item.value}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">of revenue</p>
                </div>
              ))}
            </div>
          </div>

          {/* Product Concentration */}
          <div id="chart-product-concentration">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Product Concentration Risk</h3>
              <button
                onClick={() => exportTablePng("chart-product-concentration", "Product-Concentration-Risk.png")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ImageDown className="h-3 w-3" /> PNG
              </button>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.risks.product_concentration} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" fontSize={10} stroke="var(--muted-foreground)" />
                <YAxis tickFormatter={(v) => `${v}%`} fontSize={10} stroke="var(--muted-foreground)" />
                <Tooltip
                  content={({ active, payload, label }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold">{label}</div>
                        <div>Share: {payload[0].payload.pct}%</div>
                        <div>Impact if -20%: {formatNumber(payload[0].payload.impact_if_dropped_20pct)}</div>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                  {data.risks.product_concentration.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Region Concentration */}
          <div id="chart-region-concentration">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Region Concentration Risk</h3>
              <button
                onClick={() => exportTablePng("chart-region-concentration", "Region-Concentration-Risk.png")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ImageDown className="h-3 w-3" /> PNG
              </button>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={data.risks.region_concentration}
                layout="vertical"
                margin={{ left: 80, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} fontSize={10} stroke="var(--muted-foreground)" />
                <YAxis type="category" dataKey="region" fontSize={10} width={80} stroke="var(--muted-foreground)" />
                <Tooltip
                  content={({ active, payload, label }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold">{label}</div>
                        <div>Share: {payload[0].payload.pct}%</div>
                        <div>Total: {formatNumber(payload[0].payload.total)}</div>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="pct" radius={[0, 6, 6, 0]}>
                  {data.risks.region_concentration.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ── EFFICIENCY ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <SectionTitle icon={Zap} title="TSM/TSE Efficiency" color="text-blue-500" />
            <button
              onClick={() => exportTablePng("chart-efficiency", "TSM-TSE-Efficiency.png")}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ImageDown className="h-3 w-3" /> PNG
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div id="chart-efficiency">
            <DataTable
              columns={[
                { key: "tsm_tse", label: "TSM/TSE" },
                { key: "customers", label: "Customers" },
                { key: "territories", label: "Territories" },
                { key: "total", label: "Total Sales", format: formatNumber },
                { key: "avg_per_customer", label: "Avg/Customer", format: formatNumber },
                {
                  key: "top_customer",
                  label: "Top Customer",
                  format: (v, row) => `${v} (${formatNumber(row.top_customer_total)})`,
                },
                {
                  key: "bottom_customer",
                  label: "Bottom Customer",
                  format: (v, row) => `${v} (${formatNumber(row.bottom_customer_total)})`,
                },
              ]}
              rows={data.efficiency.tsm_tse}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}