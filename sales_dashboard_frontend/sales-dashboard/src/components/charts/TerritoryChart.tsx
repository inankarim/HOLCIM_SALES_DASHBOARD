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
import { ImageDown } from "lucide-react";
import type { FilterParams } from "../../api/salesApi";
import { exportChartToPng } from "../../lib/exportPng";

const COLORS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#06b6d4","#ec4899","#84cc16",
];

interface Props {
  filters: FilterParams;
}

export function TerritoryChart({ filters }: Props) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    salesApi
      .getByTerritory(filters)
      .then((res) => {
        const mapped = (res.data.data || [])
          .map((d: any) => ({ name: d.territory, value: d.total }))
          .sort((a: any, b: any) => b.value - a.value)
          .slice(0, 15);
        setData(mapped);
      })
      .catch(() => setError("Failed to load territory data"))
      .finally(() => setLoading(false));
  }, [filters]);

  const exportPng = () => {
  exportChartToPng(chartRef.current, "Territory-Ranking.png");
};

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Territory Ranking</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Top territories by total sales
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
            <ResponsiveContainer width="100%" height={Math.max(300, data.length * 35)}>
              <BarChart
                data={data}
                layout="vertical"
                margin={{ left: 120, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  type="number"
                  tickFormatter={formatNumber}
                  fontSize={10}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  fontSize={10}
                  width={120}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  content={({ active, payload, label }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold">{label}</div>
                        <div>{formatNumber(payload[0].value)}</div>
                      </div>
                    ) : null
                  }
                />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(value: any) => formatNumber(Number(value))}
                  style={{
                    fill: "#111827",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
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