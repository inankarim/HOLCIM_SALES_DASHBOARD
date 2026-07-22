import { useEffect, useState, useRef } from "react";
import { salesApi } from "../../api/salesApi";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend
} from "recharts";
import { formatNumber } from "../../lib/formatNumber";
import { ImageDown } from "lucide-react";
import { exportChartToPng } from "../../lib/exportPng";
import type { FilterParams } from "../../api/salesApi";

const COLORS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#06b6d4",
];

// getByProduct returns each row's `name` as the short code (PLC, PLC+, ...).
// Only these three get relabeled; anything not listed here (Powercrete, HWP,
// HCG) falls through to its original short code via the `|| value` fallback.
const PRODUCT_LABELS: Record<string, string> = {
  "PLC": "Supercrete",
  "PLC+": "Supercrete +",
  "PCC + OPC": "Holcim",
};

interface Props {
  filters: FilterParams;
}

export function ProductMixChart({ filters }: Props) {
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
  exportChartToPng(chartRef.current, "Product-Mix.png");
};

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Product Mix</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Total volume share by product
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
          <div ref={chartRef} className="bg-white p-2 rounded">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  label={({ name, percent }: any) =>
                    `${PRODUCT_LABELS[name] || name} (${((percent ?? 0) * 100).toFixed(1)}%)`
                  }
                >
                  {data.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}

                </Pie>
                <Tooltip
                  content={({ active, payload }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold">
                          {PRODUCT_LABELS[payload[0].name] || payload[0].name}
                        </div>
                        <div>{formatNumber(payload[0].value)}</div>
                        <div className="text-muted-foreground">
                          {payload[0].payload.pct?.toFixed(1)}%
                        </div>
                      </div>
                    ) : null
                  }
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs">{PRODUCT_LABELS[value] || value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}