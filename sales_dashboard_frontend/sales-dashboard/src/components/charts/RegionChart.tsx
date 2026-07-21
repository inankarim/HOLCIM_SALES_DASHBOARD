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
];

const PRODUCT_KEY_MAP: Record<string, string> = {
  "PLC": "plc_mtd_sales",
  "PLC+": "plc_plus_mtd_sales",
  "POW": "powercrete_mtd_sales",
  "Holcim SS": "pcc_opc_mtd_sales",
  "HWP": "hwp_mtd_sales",
  "HCG": "hcg_mtd_sales",
};

const PRODUCT_LABELS: Record<string, string> = {
  "PLC": "Supercrete",
  "PLC+": "Supercrete Plus",
  "POW": "POW",
  "Holcim SS": "Holcim Strong Structure",
  "HWP": "Holcim Water Protect",
  "HCG": "Holcim Coastal Guard",
};

interface Props {
  filters: FilterParams;
}

export function RegionChart({ filters }: Props) {
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
      .getByRegion(filters)
      .then((res) => {
        const mapped = (res.data.data || []).map((d: any) => {
          const productKey = filters.product
            ? PRODUCT_KEY_MAP[filters.product]
            : null;
          return {
            name: d.region,
            value: productKey ? d[productKey] : d.total,
          };
        });
        setData(mapped);
      })
      .catch(() => setError("Failed to load region data"))
      .finally(() => setLoading(false));
  }, [filters]);

  if (loading) return <Card><div className="p-6 text-sm text-muted-foreground">Loading...</div></Card>;
  if (error)   return <Card><div className="p-6 text-sm text-destructive">{error}</div></Card>;

  const sorted = [...data].sort((a, b) => b.value - a.value);

  // Wider bars for region (fewer items than area/territory)
  const barWidth = isMobile ? 64 : 90;
  const minWidth = Math.max(sorted.length * barWidth + 80, 480);
  const topMargin = 48;
  const chartHeight = isMobile ? 320 + topMargin : 400 + topMargin;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Region Performance</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filters.product
                ? `${PRODUCT_LABELS[filters.product]} sales by region`
                : "Total sales by region"}
            </p>
          </div>
          <button
            onClick={() => exportChartToPng(chartRef.current, "Region-Performance.png")}
            className="ignore-export flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ImageDown className="h-4 w-4" /> PNG
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div ref={chartRef} style={{ minWidth, background: "#ffffff" }}>
            <BarChart
              width={minWidth}
              height={chartHeight}
              data={sorted}
              margin={{
                top: topMargin,
                right: 20,
                left: 8,
                bottom: isMobile ? 72 : 88,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                fontSize={isMobile ? 9 : 11}
                stroke="var(--muted-foreground)"
                interval={0}
                angle={-35}
                textAnchor="end"
                height={isMobile ? 72 : 88}
                tick={{ fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tickFormatter={formatNumber}
                fontSize={10}
                stroke="var(--muted-foreground)"
                width={56}
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
              <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={72}>
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: any) => formatNumber(Number(v))}
                  style={{
                    fontSize: isMobile ? 9 : 11,
                    fontWeight: 700,
                    fill: "#111827",
                  }}
                />
                {sorted.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}