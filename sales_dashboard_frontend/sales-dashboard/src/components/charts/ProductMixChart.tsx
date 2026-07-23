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
import { getProductColor, getProductLabel } from "../../lib/products";

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
                    `${getProductLabel(name) || name} (${((percent ?? 0) * 100).toFixed(1)}%)`
                  }
                >
                  {data.map((d: any, i: number) => (
                    <Cell key={i} fill={getProductColor(d.name)} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold">
                          {getProductLabel(payload[0].name) || payload[0].name}
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
                    <span className="text-xs">{getProductLabel(value) || value}</span>
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
