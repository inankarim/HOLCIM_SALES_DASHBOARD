import { useEffect, useState } from "react";
import { salesApi } from "../../api/salesApi";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  LabelList
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { formatNumber } from "../../lib/formatNumber";
import { ImageDown } from "lucide-react";
import { exportChartToPng } from "../../lib/exportPng";
import type { FilterParams } from "../../api/salesApi";

const COLORS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
];

interface Props {
  filters: FilterParams;
}

export function CustomerChart({ filters }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    salesApi
      .getCustomers(filters)
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load customer data"))
      .finally(() => setLoading(false));
  }, [filters]);

  const filtered = data?.data?.filter((c: any) =>
    c.customer_name?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Customer Analytics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="h-64 animate-pulse rounded bg-muted" />
        ) : error ? (
          <div className="h-64 flex items-center justify-center text-sm text-destructive">
            {error}
          </div>
        ) : (
          <>
            {/* Top 5 and Bottom 5 */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Top 5 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Top 5 Customers</h3>
                  <button
                    onClick={() => exportChartToPng(document.getElementById("top5-chart"), "Top-5-Customers.png")}
                    className="ignore-export flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ImageDown className="h-3 w-3" /> PNG
                  </button>
                </div>
                <div id="top5-chart">
                  <ResponsiveContainer width="100%" height={200}>
                        <BarChart
                          data={data?.top5 || []}
                          layout="vertical"
                          margin={{
                            left: 80,
                            right: 70,
                            top: 5,
                            bottom: 5,
                          }}
                        >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis type="number" tickFormatter={formatNumber} fontSize={9} stroke="var(--muted-foreground)" />
                      <YAxis type="category" dataKey="customer_name" fontSize={9} width={80} stroke="var(--muted-foreground)" />
                      <Tooltip
                        content={({ active, payload, label }: any) =>
                          active && payload?.length ? (
                            <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                              <div className="font-semibold">{label}</div>
                              <div>{formatNumber(payload[0].value)}</div>
                            </div>
                          ) : null
                        }
                      />
                    <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                      <LabelList
                        dataKey="total"
                        position="right"
                        formatter={(value: any) => formatNumber(Number(value))}
                        style={{
                          fill: "#111827",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      />

                      {(data?.top5 || []).map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bottom 5 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Bottom 5 Customers</h3>
                  <button
                    onClick={() => exportChartToPng(document.getElementById("bottom5-chart"), "Bottom-5-Customers.png")}
                    className="ignore-export flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ImageDown className="h-3 w-3" /> PNG
                  </button>
                </div>
                <div id="bottom5-chart">
                  <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={data?.bottom5 || []}
                        layout="vertical"
                        margin={{
                          left: 80,
                          right: 70,
                          top: 5,
                          bottom: 5,
                        }}
                      >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis type="number" tickFormatter={formatNumber} fontSize={9} stroke="var(--muted-foreground)" />
                      <YAxis type="category" dataKey="customer_name" fontSize={9} width={80} stroke="var(--muted-foreground)" />
                      <Tooltip
                        content={({ active, payload, label }: any) =>
                          active && payload?.length ? (
                            <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                              <div className="font-semibold">{label}</div>
                              <div>{formatNumber(payload[0].value)}</div>
                            </div>
                          ) : null
                        }
                      />
                    <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                      <LabelList
                        dataKey="total"
                        position="right"
                        formatter={(value: any) => formatNumber(Number(value))}
                        style={{
                          fill: "#111827",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      />

                      {(data?.bottom5 || []).map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Full Table */}
            <div>
              <div className="flex items-center justify-between mb-3 gap-3">
                <h3 className="text-sm font-semibold">
                  All Customers ({data?.total_customers || 0})
                </h3>
                <Input
                  placeholder="Search customer..."
                  className="max-w-xs h-8 text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-96 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs">Region</TableHead>
                      <TableHead className="text-xs">Area</TableHead>
                      <TableHead className="text-xs">Territory</TableHead>
                      <TableHead className="text-xs text-right">Total</TableHead>
                      <TableHead className="text-xs text-right">% Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 200).map((c: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{c.customer_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.region}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.area}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.territory}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatNumber(c.total)}</TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">
                          {c.pct_share?.toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}