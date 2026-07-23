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
  CartesianGrid,
  LabelList,
  Cell,
} from "recharts";
import { formatNumber } from "../../lib/formatNumber";
import { exportChartToPng } from "../../lib/exportPng";
import { ImageDown } from "lucide-react";
import type { FilterParams } from "../../api/salesApi";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#ec4899", "#22c55e",
];

interface Props {
  filters: FilterParams;
}

export function CustomerTypeSalesChart({ filters }: Props) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

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

  const exportPng = () => {
    exportChartToPng(chartRef.current, "Customer-Type-Sales.png");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Total Sales by Customer Type</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Total volume across all products, grouped by customer type
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
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={data}
                margin={{ left: 10, right: 10, top: 32, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="customer_type"
                  fontSize={10}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tickFormatter={formatNumber}
                  fontSize={10}
                  stroke="var(--muted-foreground)"
                  domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  content={({ active, payload, label }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold">{label}</div>
                        <div>{formatNumber(payload[0].value)}</div>
                        <div className="text-muted-foreground">
                          {payload[0].payload.pct?.toFixed(1)}% of total
                        </div>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  <LabelList
                    dataKey="total"
                    position="top"
                    formatter={(v: any) => formatNumber(Number(v))}
                    style={{ fontSize: 11, fontWeight: 600, fill: "var(--foreground)" }}
                  />
                  {data.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}