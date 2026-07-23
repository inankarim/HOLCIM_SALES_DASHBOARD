import { useEffect, useState, useRef } from "react";
import { salesApi } from "../../api/salesApi";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LabelList,
} from "recharts";
import { formatNumber } from "../../lib/formatNumber";
import { ImageDown } from "lucide-react";
import { exportChartToPng } from "../../lib/exportPng";
import type { FilterParams } from "../../api/salesApi";

const PRODUCTS = [
  "plc_mtd_sales",
  "plc_plus_mtd_sales",
  "powercrete_mtd_sales",
  "pcc_opc_mtd_sales",
  "hwp_mtd_sales",
  "hcg_mtd_sales",
];

const PRODUCT_LABELS: Record<string, string> = {
  plc_mtd_sales: "Supercrete",
  plc_plus_mtd_sales: "Supercrete Plus",
  powercrete_mtd_sales: "POW",
  pcc_opc_mtd_sales: "Holcim",
  hwp_mtd_sales: "Holcim Water Protect",
  hcg_mtd_sales: "Holcim Coastal Guard",
};

const PRODUCT_KEY_MAP: Record<string, string> = {
  "PLC": "plc_mtd_sales",
  "PLC+": "plc_plus_mtd_sales",
  "POW": "powercrete_mtd_sales",
  "Holcim SS": "pcc_opc_mtd_sales",
  "HWP": "hwp_mtd_sales",
  "HCG": "hcg_mtd_sales",
};

const COLORS: Record<string, string> = {
  plc_mtd_sales: "#3b82f6",
  plc_plus_mtd_sales: "#10b981",
  powercrete_mtd_sales: "#f59e0b",
  pcc_opc_mtd_sales: "#ec4899",
  hwp_mtd_sales: "#22c55e",
  hcg_mtd_sales: "#ef4444",
};

interface Props {
  filters: FilterParams;
}

export function AreaChart({ filters }: Props) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    salesApi
      .getByArea(filters)
      .then((res) => setData(res.data.data || []))
      .catch(() => setError("Failed to load area data"))
      .finally(() => setLoading(false));
  }, [filters]);

  const activeProducts = filters.product
    ? [PRODUCT_KEY_MAP[filters.product]].filter(Boolean)
    : PRODUCTS;

  const chartData = [...data]
    .map((item) => ({
      ...item,
      total: activeProducts.reduce((sum, key) => sum + (Number(item[key]) || 0), 0),
      // Tiny (not exactly zero) field used only to anchor the total label at the
      // top of each stack (see the labelAnchor Bar below). Recharts silently
      // skips rendering a bar segment — and its LabelList — when its value is
      // exactly 0, so we use a value small enough to be visually invisible at
      // chart scale (hundreds/thousands of MT) but still register as "real"
      // to Recharts so the label reliably renders on every bar.
      labelAnchor: 0.01,
    }))
    .sort((a, b) => b.total - a.total);

  const handleExport = () => {
    if (!chartRef.current) return;
    const el = chartRef.current;
    const prev = el.style.overflow;
    el.style.overflow = "visible";
    exportChartToPng(el, "Area-Performance.png").finally(() => {
      el.style.overflow = prev;
    });
  };

  const barWidth = isMobile ? 52 : 68;
  const chartWidth = Math.max(chartData.length * barWidth + 80, 480);
  // Extra top margin so tallest bar's label is never clipped
  const topMargin = 48;
  const chartHeight = isMobile ? 300 + topMargin : 360 + topMargin;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Area Performance — Product Mix</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Stacked product volume by area
            </p>
          </div>
          <button
            onClick={handleExport}
            className="ignore-export flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ImageDown className="h-4 w-4" /> PNG
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 animate-pulse rounded bg-muted" />
        ) : error ? (
          <div className="h-64 flex items-center justify-center text-sm text-destructive">
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div ref={chartRef} style={{ minWidth: chartWidth, background: "#ffffff" }}>
              <BarChart
                width={chartWidth}
                height={chartHeight}
                data={chartData}
                margin={{
                  top: topMargin,
                  right: 16,
                  left: 8,
                  bottom: isMobile ? 72 : 88,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

                <XAxis
                  dataKey="area"
                  fontSize={isMobile ? 8 : 10}
                  stroke="var(--muted-foreground)"
                  interval={0}
                  angle={-40}
                  textAnchor="end"
                  height={isMobile ? 72 : 88}
                  tick={{ fill: "var(--muted-foreground)" }}
                />

                <YAxis
                  tickFormatter={formatNumber}
                  fontSize={9}
                  stroke="var(--muted-foreground)"
                  width={56}
                  tick={{ fill: "var(--muted-foreground)" }}
                />

                {/* Custom content instead of `formatter` — for a stacked bar,
                   the payload includes every series at that x position, so
                   we can list all active products' values in one tooltip
                   instead of just the single segment under the cursor. */}
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  content={({ active, payload, label }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold mb-1">{label}</div>
                        {payload
                          .filter((p: any) => p.dataKey !== "total" && p.dataKey !== "labelAnchor")
                          .map((p: any) => (
                            <div
                              key={p.dataKey}
                              className="flex items-center justify-between gap-4"
                            >
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="inline-block h-2 w-2 rounded-sm"
                                  style={{ backgroundColor: p.fill }}
                                />
                                {PRODUCT_LABELS[p.dataKey] || p.dataKey}
                              </span>
                              <span className="font-medium">
                                {formatNumber(Number(p.value))}
                              </span>
                            </div>
                          ))}
                        {/* Total row — read from the pre-computed `total` field on
                           each data point (same value the labelAnchor bar labels
                           at the top of the stack), not summed from payload here,
                           so it always reflects the full stack regardless of
                           which individual product segments are 0. */}
                        <div className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t font-semibold">
                          <span>Total</span>
                          <span>{formatNumber(Number(payload[0]?.payload?.total ?? 0))}</span>
                        </div>
                      </div>
                    ) : null
                  }
                />

                <Legend
                  wrapperStyle={{ paddingTop: 12 }}
                  formatter={(value) => (
                    <span style={{ fontSize: isMobile ? 9 : 11 }}>
                      {PRODUCT_LABELS[value] || value}
                    </span>
                  )}
                />

                {activeProducts.map((product, index) => {
                  const isTop = index === activeProducts.length - 1;
                  return (
                    <Bar
                      key={product}
                      dataKey={product}
                      stackId="a"
                      fill={COLORS[product]}
                      radius={isTop ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      maxBarSize={56}
                    />
                  );
                })}

                {/*
                  Dedicated near-zero-height bar stacked on top of every real
                  product segment. Its value (0.01) is negligible at chart scale,
                  so it adds no visible height, but being non-zero keeps Recharts
                  from skipping the rect (and therefore the LabelList) the way it
                  does for exact-0 segments. Recharts still positions it at the
                  exact top of the stack for every row — including rows where the
                  "last" product (e.g. Holcim Coastal Guard) happens to be 0 and
                  wouldn't otherwise render anything to hang a label on. This
                  guarantees the total label is always visible above every bar
                  (not just on hover, and not just on the one row where the
                  top-most product happens to be non-zero) — which matters for
                  the PNG export, where hovering isn't possible.
                */}
                <Bar
                  dataKey="labelAnchor"
                  stackId="a"
                  fill="transparent"
                  legendType="none"
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="total"
                    position="top"
                    formatter={(v: any) => formatNumber(Number(v))}
                    style={{
                      fontSize: isMobile ? 8 : 10,
                      fontWeight: 700,
                      fill: "#111827",
                    }}
                  />
                </Bar>
              </BarChart>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}