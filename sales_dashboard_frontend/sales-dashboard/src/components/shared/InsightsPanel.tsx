import { useEffect, useState } from "react";
import { salesApi } from "../../api/salesApi";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Lightbulb, TrendingUp, TrendingDown, Star, AlertTriangle } from "lucide-react";
import { formatNumber } from "../../lib/formatNumber";
import type { FilterParams } from "../../api/salesApi";

interface Props {
  filters: FilterParams;
}

export function InsightsPanel({ filters }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    salesApi
      .getInsights(filters)
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="grid gap-2 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const insights = [
    {
      icon: Star,
      color: "text-green-500",
      text: (
        <>
          Best performing region: <b>{data.best_region?.name}</b> with{" "}
          {formatNumber(data.best_region?.value ?? 0)}
        </>
      ),
    },
    {
      icon: AlertTriangle,
      color: "text-red-500",
      text: (
        <>
          Worst region: <b>{data.worst_region?.name}</b> at{" "}
          {formatNumber(data.worst_region?.value ?? 0)}
        </>
      ),
    },
    {
      icon: AlertTriangle,
      color: "text-red-500",
      text: (
        <>
          Weakest territory: <b>{data.weakest_territory?.name}</b> at{" "}
          {formatNumber(data.weakest_territory?.value ?? 0)}
        </>
      ),
    },
    {
      icon: TrendingUp,
      color: "text-blue-500",
      text: (
        <>
          Top customer: <b>{data.top_customer?.name}</b> contributing{" "}
          {formatNumber(data.top_customer?.value ?? 0)}
        </>
      ),
    },
    {
      icon: TrendingDown,
      color: "text-yellow-500",
      text: (
        <>
          Lowest customer: <b>{data.lowest_customer?.name}</b> at{" "}
          {formatNumber(data.lowest_customer?.value ?? 0)}
        </>
      ),
    },
    {
      icon: Star,
      color: "text-green-500",
      text: (
        <>
          Most sold product: <b>{data.most_sold_product?.name}</b> (
          {formatNumber(data.most_sold_product?.value ?? 0)})
        </>
      ),
    },
    {
      icon: AlertTriangle,
      color: "text-red-500",
      text: (
        <>
          Least sold product: <b>{data.least_sold_product?.name}</b> (
          {formatNumber(data.least_sold_product?.value ?? 0)})
        </>
      ),
    },
    ...(data.product_dependency || []).map((d: any) => ({
        icon: Lightbulb,
        color: "text-blue-500",
        text: (
            <>
            <b>{d.region}</b> relies on <b>{d.top_product}</b> for {d.pct}% of its sales.
            </>
        ),
    })),
  ];

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-accent/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4 text-primary" /> Executive Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 md:grid-cols-2">
          {insights.map((it, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-lg bg-card/70 p-3 text-sm"
            >
              <it.icon className={`mt-0.5 h-4 w-4 shrink-0 ${it.color}`} />
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}