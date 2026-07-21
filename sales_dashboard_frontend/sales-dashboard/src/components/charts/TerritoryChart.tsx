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
  Cell,
  LabelList,
} from "recharts";
import { formatNumber } from "../../lib/formatNumber";
import { ImageDown } from "lucide-react";
import type { FilterParams } from "../../api/salesApi";
import { exportChartToPng } from "../../lib/exportPng";

const COLORS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#06b6d4","#ec4899","#84cc16",
  "#f97316","#14b8a6","#a855f7","#eab308",
  "#64748b","#e11d48","#0ea5e9",
];

interface Props {
  filters: FilterParams;
}

export function TerritoryChart({ filters }: Props) {
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

  // Scale chart width so territory names never overlap
  const barWidth = isMobile ? 44 : 56;
  const chartWidth = Math.max(data.length * barWidth + 80, 480);
  const chartHeight = isMobile ? 260 : 320;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Territory Ranking</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Top 15 territories by total sales
            </p>
          </div>
          <button
            onClick={() => exportChartToPng(chartRef.current, "Territory-Ranking.png")}
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
                data={data}
                margin={{
                  top: 28,
                  right: 16,
                  left: 8,
                  bottom: isMobile ? 64 : 80,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

                <XAxis
                  dataKey="name"
                  fontSize={isMobile ? 8 : 10}
                  stroke="var(--muted-foreground)"
                  interval={0}
                  angle={-40}
                  textAnchor="end"
                  height={isMobile ? 64 : 80}
                  tick={{ fill: "var(--muted-foreground)" }}
                />

                <YAxis
                  tickFormatter={formatNumber}
                  fontSize={9}
                  stroke="var(--muted-foreground)"
                  width={52}
                  tick={{ fill: "var(--muted-foreground)" }}
                />

                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  content={({ active, payload, label }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold">{label}</div>
                        <div>{formatNumber(payload[0].value)}</div>
                      </div>
                    ) : null
                  }
                />

                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(v: any) => formatNumber(Number(v))}
                    style={{
                      fontSize: isMobile ? 8 : 10,
                      fontWeight: 600,
                      fill: "#111827",
                    }}
                  />
                  {data.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}