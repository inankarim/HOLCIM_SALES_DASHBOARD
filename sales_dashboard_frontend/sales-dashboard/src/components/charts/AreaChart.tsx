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
  LabelList
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
  pcc_opc_mtd_sales: "Holcim Strong Structure",
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
  // ✅ ref goes directly on the element wrapping the BarChart SVG — NOT the scroll container
  const chartRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);


  const TotalLabel = (props: any) => {
  const { x, y, width, height, value } = props;

  return (
    <text
      x={x + width + 8}
      y={y + height / 2}
      fill="#111827"
      fontSize={isMobile ? 9 : 11}
      fontWeight={700}
      dominantBaseline="middle"
    >
      {formatNumber(value)}
    </text>
  );
};


  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const activeProducts = filters.product
    ? [PRODUCT_KEY_MAP[filters.product]].filter(Boolean)
    : PRODUCTS;

    const chartData = data.map((item) => ({
  ...item,
  total: activeProducts.reduce(
    (sum, key) => sum + (Number(item[key]) || 0),
    0,
  ),
  }));

  useEffect(() => {
    setLoading(true);
    setError(null);
    salesApi
      .getByArea(filters)
      .then((res) => setData(res.data.data || []))
      .catch(() => setError("Failed to load area data"))
      .finally(() => setLoading(false));
  }, [filters]);

  const chartHeight = Math.max(300, data.length * 35);
  const chartWidth = isMobile ? 400 : 1200;

  const handleExport = () => {
    if (!chartRef.current) return;
    // ✅ Temporarily remove overflow so html-to-image captures full content
    const el = chartRef.current;
    const prev = el.style.overflow;
    el.style.overflow = "visible";
    exportChartToPng(el, "Area-Performance.png").finally(() => {
      el.style.overflow = prev;
    });
  };

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
          {/* ✅ ignore-export keeps the button OUT of the captured image */}
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
          // ✅ overflow-x-auto stays on an OUTER wrapper, NOT on the ref element
          <div className="overflow-x-auto">
            {/* ✅ ref is placed here — directly on the element containing the SVG */}
            <div ref={chartRef} style={{ background: "#ffffff", display: "inline-block" }}>
    <BarChart
      width={chartWidth}
      height={chartHeight}
      data={chartData}
      layout="vertical"
      margin={{
        left: isMobile ? 55 : 100,
        right: isMobile ? 70 : 90, // Extra room for total labels
        top: 5,
        bottom: 5,
      }}
    >
      <CartesianGrid
        strokeDasharray="3 3"
        stroke="var(--border)"
      />

      <XAxis
        type="number"
        tickFormatter={formatNumber}
        fontSize={isMobile ? 8 : 10}
        stroke="var(--muted-foreground)"
      />

      <YAxis
        type="category"
        dataKey="area"
        fontSize={isMobile ? 7 : 10}
        width={isMobile ? 55 : 100}
        stroke="var(--muted-foreground)"
        tickFormatter={(value) =>
          isMobile && value.length > 9
            ? value.slice(0, 9) + "…"
            : value
        }
      />

      <Tooltip
        formatter={(value: any) => formatNumber(Number(value))}
      />

      <Legend
        formatter={(value) => (
          <span className={isMobile ? "text-[9px]" : "text-xs"}>
            {PRODUCT_LABELS[value] || value}
          </span>
        )}
      />

      {/* Stacked product bars */}
      {activeProducts.map((product, index) => (
        <Bar
          key={product}
          dataKey={product}
          stackId="a"
          fill={COLORS[product]}
        >
          {index === activeProducts.length - 1 && (
            <LabelList
              dataKey="total"
              content={<TotalLabel />}
            />
          )}
        </Bar>
      ))}

      {/* Invisible bar used only to display total labels */}
      <Bar
        dataKey="total"
        fill="transparent"
        stackId="none"
      >
        <LabelList
          dataKey="total"
          position="right"
          formatter={(value: any) => formatNumber(Number(value))}
          style={{
            fill: "#111827",
            fontSize: isMobile ? 9 : 11,
            fontWeight: 700,
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