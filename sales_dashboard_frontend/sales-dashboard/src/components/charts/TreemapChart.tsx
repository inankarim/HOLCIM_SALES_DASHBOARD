import { useEffect, useState, useRef } from "react";
import { salesApi } from "../../api/salesApi";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  ResponsiveContainer,
  Treemap,
  Tooltip,
} from "recharts";
import { formatNumber } from "../../lib/formatNumber";
import { ImageDown } from "lucide-react";
import type { FilterParams } from "../../api/salesApi";
import { exportChartToPng } from "../../lib/exportPng";

const COLORS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#06b6d4","#ec4899","#84cc16",
  "#f97316","#14b8a6","#a855f7","#eab308",
];

interface Props {
  filters: FilterParams;
}

const CustomContent = (props: any) => {
  const { x, y, width, height, name, value, index } = props;
  if (width < 30 || height < 20) return null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: COLORS[index % COLORS.length],
          stroke: "#fff",
          strokeWidth: 2,
        }}
        rx={4}
      />
      {width > 60 && height > 30 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 6}
            textAnchor="middle"
            fill="#fff"
            fontSize={10}
            fontWeight="600"
          >
            {name?.length > 12 ? name.slice(0, 12) + "…" : name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 8}
            textAnchor="middle"
            fill="#fff"
            fontSize={9}
            opacity={0.9}
          >
            {formatNumber(value)}
          </text>
        </>
      )}
    </g>
  );
};

export function TreemapChart({ filters }: Props) {
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
          .filter((d: any) => d.value > 0)
          .sort((a: any, b: any) => b.value - a.value);
        setData(mapped);
      })
      .catch(() => setError("Failed to load treemap data"))
      .finally(() => setLoading(false));
  }, [filters]);

  const exportPng = () => {
  exportChartToPng(chartRef.current, "Territory-Treemap.png");
};

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Territory Treemap</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Relative territory size
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
            <ResponsiveContainer width="100%" height={400}>
              <Treemap
                data={data}
                dataKey="value"
                content={<CustomContent />}
              >
                <Tooltip
                  content={({ active, payload }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold">{payload[0].payload.name}</div>
                        <div>{formatNumber(payload[0].value)}</div>
                      </div>
                    ) : null
                  }
                />
              </Treemap>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}