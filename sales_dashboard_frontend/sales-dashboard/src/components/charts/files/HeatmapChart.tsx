import { useEffect, useState, useRef } from "react";
import { salesApi } from "../../api/salesApi";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { formatNumber } from "../../lib/formatNumber";
import { ImageDown } from "lucide-react";
import type { FilterParams } from "../../api/salesApi";
import { exportChartToPng } from "../../lib/exportPng";
import { PRODUCT_CODES, PRODUCT_DATA_KEYS, PRODUCT_LABELS, PRODUCT_COLORS } from "../config/products";

interface Props {
  filters: FilterParams;
}

// Convert a "#rrggbb" hex color to an "r, g, b" triplet for use in rgba().
// Falls back to a neutral gray if the slot in products.ts is still blank.
function hexToRgb(hex: string): string {
  const clean = (hex || "#94a3b8").replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
}

export function HeatmapChart({ filters }: Props) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    salesApi
      .getHeatmap(filters)
      .then((res) => setData(res.data.data || []))
      .catch(() => setError("Failed to load heatmap data"))
      .finally(() => setLoading(false));
  }, [filters]);

  const getMax = () => {
    let max = 0;
    data.forEach((row) => {
      PRODUCT_CODES.forEach((code) => {
        const dataKey = PRODUCT_DATA_KEYS[code];
        if (row[dataKey] > max) max = row[dataKey];
      });
    });
    return max;
  };

  const getIntensity = (value: number, max: number) => {
    if (!max) return 0;
    return Math.round((value / max) * 100);
  };

  const exportPng = () => {
    exportChartToPng(chartRef.current, "Region-Product-Heatmap.png");
  };

  const max = getMax();

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Region × Product Heatmap</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Product contribution within each region
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
          <div className="overflow-x-auto">
            <div ref={chartRef} style={{ background: "#ffffff", display: "inline-block", minWidth: "100%" }}>
              <table id="heatmap-table" className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">
                      Region
                    </th>
                    {PRODUCT_CODES.map((code) => (
                      <th
                        key={code}
                        className="text-center py-2 px-3 text-muted-foreground font-medium"
                      >
                        {PRODUCT_LABELS[code]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="py-2 px-3 font-medium">{row.region}</td>
                      {PRODUCT_CODES.map((code) => {
                        const dataKey = PRODUCT_DATA_KEYS[code];
                        const intensity = getIntensity(row[dataKey], max);
                        const rgb = hexToRgb(PRODUCT_COLORS[code]);
                        return (
                          <td key={code} className="py-1.5 px-2 text-center">
                            <div
                              className="rounded-lg px-2 py-1.5 font-medium transition-all"
                              style={{
                                backgroundColor: `rgba(${rgb}, ${intensity / 100})`,
                                color: intensity > 50 ? "white" : "inherit",
                              }}
                              title={`${row.region} · ${PRODUCT_LABELS[code]}: ${formatNumber(row[dataKey])}`}
                            >
                              {formatNumber(row[dataKey])}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
