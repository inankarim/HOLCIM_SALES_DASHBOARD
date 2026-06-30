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
  "#3b82f6","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#06b6d4",
];

interface Props {
  filters: FilterParams;
}

export function ProductComparisonChart({ filters }: Props) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    salesApi
      .getByProduct(filters)
      .then((res) => setData(res.data.data || []))
      .catch(() => setError("Failed to load product data"))
      .finally(() => setLoading(false));
  }, [filters]);

  const exportPng = () => {
  exportChartToPng(chartRef.current, "Product-Comparison.png");
};

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Product Comparison</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Top to lowest selling products
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
          <div ref={chartRef}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={data}
                margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="name"
                  fontSize={10}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tickFormatter={formatNumber}
                  fontSize={10}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  content={({ active, payload, label }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold">{label}</div>
                        <div>{formatNumber(payload[0].value)}</div>
                        <div className="text-muted-foreground">
                          {payload[0].payload.pct?.toFixed(1)}%
                        </div>
                      </div>
                    ) : null
                  }
                />
<Bar dataKey="value" radius={[6, 6, 0, 0]}>
  <LabelList
    dataKey="value"
    position="top"
    content={({ x, y, width, value }) => (
      <text
        x={(x as number) + (width as number) / 2}
        y={(y as number) - 8}
        textAnchor="middle"
        fontSize={11}
        fontWeight="600"
        fill="var(--foreground)"
      >
        {formatNumber(Number(value))}
      </text>
    )}
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