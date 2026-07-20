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
  Cell,
  LabelList,
} from "recharts";
import { formatNumber } from "../../lib/formatNumber";
import { ImageDown, TrendingDown, TrendingUp } from "lucide-react";
import { exportChartToPng } from "../../lib/exportPng";
import type { FilterParams } from "../../api/salesApi";

interface Props {
  filters: FilterParams;
}

interface ProductRow {
  key: string;
  label: string;
  mtd: number;
  target: number;
  ach: number;
}

// Achievement thresholds — tune to whatever the business considers on-track
function statusColor(ach: number) {
  if (ach >= 100) return { bar: "#2563eb", text: "#1d4ed8", bg: "#eff6ff" }; // ahead of target
  if (ach >= 95) return { bar: "#16a34a", text: "#15803d", bg: "#f0fdf4" };
  if (ach >= 80) return { bar: "#f59e0b", text: "#b45309", bg: "#fffbeb" };
  return { bar: "#dc2626", text: "#b91c1c", bg: "#fef2f2" };
}

export function TargetAttainmentChart({ filters }: Props) {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [totalMtd, setTotalMtd] = useState(0);
  const [totalTarget, setTotalTarget] = useState(0);
  const [overallAch, setOverallAch] = useState(0);
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
      .getMtdTargetByProduct(filters)
      .then((res) => {
        const d = res.data || {};
        const mapped: ProductRow[] = (d.data || []).map((p: any) => ({
          key: p.key,
          label: p.name,
          mtd: Number(p.mtd_sales) || 0,
          target: Number(p.target) || 0,
          ach: Number(p.achievement_pct) || 0,
        }));
        setRows(mapped);
        setTotalMtd(Number(d.total_mtd_sales) || 0);
        setTotalTarget(Number(d.total_target) || 0);
        setOverallAch(Number(d.overall_achievement_pct) || 0);
      })
      .catch(() => setError("Failed to load target data"))
      .finally(() => setLoading(false));
  }, [filters]);

  const overallColor = statusColor(overallAch);

  const sorted = [...rows].sort((a, b) => a.ach - b.ach);
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];

  const exportPng = () => {
    exportChartToPng(chartRef.current, "Target-Attainment.png");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">MTD Target Attainment</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              MTD sales vs target, product by product
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
          <div ref={chartRef} style={{ background: "#ffffff" }} className="space-y-4">
            {/* Overall company headline */}
            <div
              className="rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
              style={{ backgroundColor: overallColor.bg }}
            >
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Company-wide MTD
                </p>
                <p className="text-2xl font-bold" style={{ color: overallColor.text }}>
                  {overallAch.toFixed(1)}% of target
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatNumber(totalMtd)} sold against {formatNumber(totalTarget)} target
                </p>
              </div>
              <div className="flex gap-6 text-xs">
                {best && (
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                    <div>
                      <div className="font-semibold">{best.label}</div>
                      <div className="text-muted-foreground">
                        {best.ach >= 100
                          ? `${(best.ach - 100).toFixed(0)}% over target`
                          : `${best.ach.toFixed(0)}% of target`}
                      </div>
                    </div>
                  </div>
                )}
                {worst && (
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="h-4 w-4 text-red-600" />
                    <div>
                      <div className="font-semibold">{worst.label}</div>
                      <div className="text-muted-foreground">
                        {(100 - worst.ach).toFixed(0)}% behind target
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Grouped bars: MTD sales vs Target, thin bars, tight spacing */}
            <ResponsiveContainer width="100%" height={isMobile ? 280 : 320}>
              <BarChart
                data={sorted}
                margin={{ top: 20, right: 10, left: 0, bottom: 5 }}
                barGap={3}
                barCategoryGap="28%"
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
                  width={40}
                />
                <Tooltip
                  content={({ active, payload }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold">{payload[0].payload.label}</div>
                        <div>MTD: {formatNumber(payload[0].payload.mtd)}</div>
                        <div>Target: {formatNumber(payload[0].payload.target)}</div>
                        <div className="font-medium mt-1">
                          {payload[0].payload.ach.toFixed(1)}% of target
                        </div>
                      </div>
                    ) : null
                  }
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => (value === "target" ? "Target" : "MTD Sales")}
                />

                {/* Target — thin grey reference bar */}
                <Bar dataKey="target" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={16} />

                {/* MTD sales — colored by achievement, can visibly clear the target bar */}
                <Bar dataKey="mtd" radius={[3, 3, 0, 0]} maxBarSize={16}>
                  {sorted.map((row) => (
                    <Cell key={row.key} fill={statusColor(row.ach).bar} />
                  ))}
                  <LabelList
                    dataKey="ach"
                    position="top"
                    formatter={(v: any) => `${Number(v).toFixed(0)}%`}
                    style={{ fontSize: 10, fontWeight: 600, fill: "#111827" }}
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