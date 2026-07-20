import { useEffect, useState, useRef } from "react";
import { salesApi } from "../../api/salesApi";
import { Card, CardHeader, CardTitle } from "../ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,

  Cell,              // ✅ Fix 1: added missing Cell import
} from "recharts";
import { formatNumber } from "../../lib/formatNumber";
import { ImageDown } from "lucide-react";
import type { FilterParams } from "../../api/salesApi";
import { exportChartToPng } from "../../lib/exportPng";

const COLORS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#06b6d4","#ec4899","#84cc16",
];

// ✅ Fix 2: moved constants outside component so they aren't recreated on every render
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

  // ✅ Fix 3: compute isMobile reactively so it responds to window resizing
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

  const exportPng = () => {
    exportChartToPng(chartRef.current, "Region-Performance.png");
  };
    if (loading) return <Card><div className="p-6 text-sm text-muted-foreground">Loading...</div></Card>;
    if (error) return <Card><div className="p-6 text-sm text-destructive">{error}</div></Card>;
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
            onClick={exportPng}
            className="ignore-export flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ImageDown className="h-4 w-4" /> PNG
          </button>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <div ref={chartRef} style={{ minWidth: isMobile ? 300 : "100%", background: "#ffffff" }}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{
                left: isMobile ? 60 : 80,
                right: isMobile ? 8 : 20,
                top: 5,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                type="number"
                tickFormatter={formatNumber}
                fontSize={isMobile ? 8 : 10}
                stroke="var(--muted-foreground)"
              />
              <YAxis
                type="category"
                dataKey="name"
                fontSize={isMobile ? 7 : 10}
                width={isMobile ? 60 : 80}
                stroke="var(--muted-foreground)"
                tickFormatter={(value) =>
                  isMobile && value.length > 9 ? value.slice(0, 9) + "…" : value
                }
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
             <Bar
  dataKey="value"
  radius={[0, 6, 6, 0]}
  label={({ x = 0, y = 0, width = 0, height = 0, value }) => {
    const xPos = Number(x);
    const yPos = Number(y);
    const w = Number(width);
    const h = Number(height);

    return (
      <text
        x={xPos + w + 5}
        y={yPos + h / 2}
        dy={4}
        fontSize={11}
        fill="var(--foreground)"
      >
        {formatNumber(Number(value))}
      </text>
    );
  }}
>
  {data.map((_, i) => (
    <Cell key={i} fill={COLORS[i % COLORS.length]} />
  ))}
</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}