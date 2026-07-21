import { useEffect, useState, useRef } from "react";
import { salesApi } from "../../api/salesApi";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { formatNumber } from "../../lib/formatNumber";
import { ImageDown } from "lucide-react";
import type { FilterParams } from "../../api/salesApi";
import { exportChartToPng } from "../../lib/exportPng";


const PRODUCTS = [
  "plc_mtd_sales",
  "plc_plus_mtd_sales",
  "powercrete_mtd_sales",
  "pcc_opc_mtd_sales",
  "hwp_mtd_sales",
  "hcg_mtd_sales",
];
const PRODUCT_LABELS: Record<string, string> = {
  plc_mtd_sales: "PLC",
  plc_plus_mtd_sales: "PLC+",
  powercrete_mtd_sales: "POW",
  pcc_opc_mtd_sales: "HOLCIM",
  hwp_mtd_sales: "HWP",
  hcg_mtd_sales: "HCG",
};

interface Props {
  filters: FilterParams;
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
      PRODUCTS.forEach((p) => {
        if (row[p] > max) max = row[p];
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
                  {PRODUCTS.map((p) => (
                    <th
                      key={p}
                      className="text-center py-2 px-3 text-muted-foreground font-medium"
                    >
                      {PRODUCT_LABELS[p]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="py-2 px-3 font-medium">{row.region}</td>
                    {PRODUCTS.map((p) => {
                      const intensity = getIntensity(row[p], max);
                      return (
                        <td key={p} className="py-1.5 px-2 text-center">
                          <div
                            className="rounded-lg px-2 py-1.5 font-medium transition-all"
                            style={{
                              backgroundColor: `rgba(59, 130, 246, ${intensity / 100})`,
                              color: intensity > 50 ? "white" : "inherit",
                            }}
                            title={`${row.region} · ${PRODUCT_LABELS[p]}: ${formatNumber(row[p])}`}
                          >
                            {formatNumber(row[p])}
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