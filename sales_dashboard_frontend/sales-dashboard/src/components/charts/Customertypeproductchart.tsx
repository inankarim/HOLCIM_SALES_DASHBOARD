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
import {
  PRODUCT_CODES,
  PRODUCT_DATA_KEYS,
  getProductColor,
  getProductLabel,
} from "../../lib/products";

const ALL_PRODUCT_KEYS = PRODUCT_CODES.map((code) => PRODUCT_DATA_KEYS[code]);

// filters.product arrives as a short code (e.g. "PLC+", "Holcim SS") — this
// maps it to the *_mtd_sales column used for stacking.
const PRODUCT_KEY_MAP: Record<string, string> = {
  "PLC": "plc_mtd_sales",
  "PLC+": "plc_plus_mtd_sales",
  "POW": "powercrete_mtd_sales",
  "Holcim SS": "pcc_opc_mtd_sales",
  "HWP": "hwp_mtd_sales",
  "HCG": "hcg_mtd_sales",
};

interface Props {
  filters: FilterParams;
}

export function CustomerTypeProductChart({ filters }: Props) {
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
      .getByCustomerType(filters)
      .then((res) => {
        // Defensive filter — backend already excludes 0-total types via
        // HAVING, but this guards against stale/cached responses too.
        const rows = (res.data.data || []).filter((r: any) => Number(r.total) > 0);
        setData(rows);
      })
      .catch(() => setError("Failed to load customer type data"))
      .finally(() => setLoading(false));
  }, [filters]);

  const activeProducts = filters.product
    ? [PRODUCT_KEY_MAP[filters.product]].filter(Boolean)
    : ALL_PRODUCT_KEYS;

  const chartData = [...data]
    .map((item) => ({
      ...item,
      total: activeProducts.reduce((sum, key) => sum + (Number(item[key]) || 0), 0),
      // Tiny (not exactly zero) field used only to anchor the total label at
      // the top of each stack — see AreaChart.tsx for the full explanation of
      // why this needs to be non-zero (Recharts skips rendering exact-0 bar
      // segments, including their LabelList).
      labelAnchor: 0.01,
    }))
    .sort((a, b) => b.total - a.total);

  const handleExport = () => {
    if (!chartRef.current) return;
    const el = chartRef.current;
    const prev = el.style.overflow;
    el.style.overflow = "visible";
    exportChartToPng(el, "Customer-Type-Product-Mix.png").finally(() => {
      el.style.overflow = prev;
    });
  };

  const barWidth = isMobile ? 60 : 90;
  const chartWidth = Math.max(chartData.length * barWidth + 80, 480);
  const topMargin = 48;
  const chartHeight = isMobile ? 300 + topMargin : 360 + topMargin;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Product Mix by Customer Type</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Stacked product volume, grouped by customer type
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
                  bottom: isMobile ? 40 : 48,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

                <XAxis
                  dataKey="customer_type"
                  fontSize={isMobile ? 8 : 10}
                  stroke="var(--muted-foreground)"
                  interval={0}
                  tick={{ fill: "var(--muted-foreground)" }}
                />

                <YAxis
                  tickFormatter={formatNumber}
                  fontSize={9}
                  stroke="var(--muted-foreground)"
                  width={56}
                  tick={{ fill: "var(--muted-foreground)" }}
                />

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
                                {getProductLabel(p.dataKey)}
                              </span>
                              <span className="font-medium">
                                {formatNumber(Number(p.value))}
                              </span>
                            </div>
                          ))}
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
                    <span style={{ fontSize: isMobile ? 9 : 11 }}>{getProductLabel(value)}</span>
                  )}
                />

                {activeProducts.map((product, index) => {
                  const isTop = index === activeProducts.length - 1;
                  return (
                    <Bar
                      key={product}
                      dataKey={product}
                      stackId="a"
                      fill={getProductColor(product)}
                      radius={isTop ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      maxBarSize={72}
                    />
                  );
                })}

                {/* See AreaChart.tsx for full explanation: a near-zero (not
                   exactly 0) anchor bar keeps Recharts from skipping the total
                   label on rows where the topmost product happens to be 0. */}
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
