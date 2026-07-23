import { useEffect, useState, useRef } from "react";
import { salesApi } from "../../api/salesApi";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LabelList,
} from "recharts";
import { formatNumber } from "../../lib/formatNumber";
import { ImageDown } from "lucide-react";
import { exportChartToPng } from "../../lib/exportPng";
import type { FilterParams } from "../../api/salesApi";
import { getProductColor, getProductLabel } from "../../lib/products";

interface Props {
  filters: FilterParams;
}

interface ProductRow {
  key: string;
  label: string;
  color: string;
  target: number;
  mtd: number;
  yesterday: number;
}

const TARGET_COLOR = "#cbd5e1";
const MTD_COLOR = "#2563eb";
const YESTERDAY_COLOR = "#f59e0b";

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function TargetAttainmentChart({ filters }: Props) {
  const [rows, setRows] = useState<ProductRow[]>([]);
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

    Promise.all([
      salesApi.getMtdTargetByProduct(filters),
      salesApi.getYesterdayByProduct(filters),
    ])
      .then(([mtdRes, yestRes]) => {
        const mtdData = mtdRes.data?.data || [];
        const yestData = yestRes.data?.data || [];

        // yesterday response is keyed by product name only (no `key`),
        // so index it by normalized name to merge onto the mtd rows.
        const yestByName = new Map(
          yestData.map((p: any) => [normalize(p.name ?? ""), Number(p.value) || 0]),
        );

        const merged: ProductRow[] = mtdData.map((p: any) => {
          // Try the internal `key` first, fall back to the display `name` —
          // getProductLabel/getProductColor both resolve any known short
          // code, display name, or internal column name to the same product.
          const identity = p.key ?? p.name;
          return {
            key: p.key,
            label: getProductLabel(identity) || p.name,
            color: getProductColor(identity),
            target: Number(p.target) || 0,
            mtd: Number(p.mtd_sales) || 0,
            yesterday: yestByName.get(normalize(p.name ?? "")) ?? 0,
          };
        });

        setRows(merged);
      })
      .catch(() => setError("Failed to load chart data"))
      .finally(() => setLoading(false));
  }, [filters]);

  const exportPng = () => {
    exportChartToPng(chartRef.current, "Target-vs-MTD-vs-Yesterday.png");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Target vs MTD vs Yesterday</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sales comparison, product by product
            </p>
          </div>
          <button
            onClick={exportPng}
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
          <div ref={chartRef} style={{ background: "#ffffff" }}>
            <ResponsiveContainer width="100%" height={isMobile ? 300 : 360}>
              <BarChart
                data={rows}
                margin={{ top: 28, right: 10, left: 10, bottom: 5 }}
                barGap={3}
                barCategoryGap="24%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  fontSize={isMobile ? 8 : 10}
                  stroke="var(--muted-foreground)"
                  interval={0}
                  angle={isMobile ? -35 : 0}
                  textAnchor={isMobile ? "end" : "middle"}
                  height={isMobile ? 50 : 25}
                />
                <YAxis
                  tickFormatter={formatNumber}
                  fontSize={9}
                  stroke="var(--muted-foreground)"
                  width={55}
                />
                <Tooltip
                  content={({ active, payload }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold">{payload[0].payload.label}</div>
                        <div>Target: {formatNumber(payload[0].payload.target)}</div>
                        <div>MTD: {formatNumber(payload[0].payload.mtd)}</div>
                        <div>Yesterday: {formatNumber(payload[0].payload.yesterday)}</div>
                      </div>
                    ) : null
                  }
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) =>
                    value === "target" ? "Target" : value === "mtd" ? "MTD Sales" : "Yesterday"
                  }
                />

                <Bar dataKey="target" fill={TARGET_COLOR} radius={[3, 3, 0, 0]} maxBarSize={16}>
                  <LabelList
                    dataKey="target"
                    position="top"
                    formatter={(v: any) => (isMobile ? "" : formatNumber(v))}
                    style={{ fontSize: 9, fill: "#64748b" }}
                  />
                </Bar>

                <Bar dataKey="mtd" fill={MTD_COLOR} radius={[3, 3, 0, 0]} maxBarSize={16}>
                  <LabelList
                    dataKey="mtd"
                    position="top"
                    formatter={(v: any) => formatNumber(v)}
                    style={{ fontSize: isMobile ? 8 : 10, fontWeight: 600, fill: "#111827" }}
                  />
                </Bar>

                <Bar dataKey="yesterday" fill={YESTERDAY_COLOR} radius={[3, 3, 0, 0]} maxBarSize={16}>
                  <LabelList
                    dataKey="yesterday"
                    position="top"
                    formatter={(v: any) => formatNumber(v)}
                    style={{ fontSize: isMobile ? 8 : 10, fontWeight: 600, fill: "#111827" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
