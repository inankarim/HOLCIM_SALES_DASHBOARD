import { useEffect, useState } from "react";
import { salesApi } from "../../api/salesApi";
import { KpiCard } from "./KpiCard";
import { formatNumber } from "../../lib/formatNumber";
import type { FilterParams } from "../../api/salesApi";

interface KpiData {
  date_used: string;
  total_sales: number;
  total_customers: number;
  total_territories: number;
  avg_per_customer: number;
  top_region: { name: string; value: number };
  lowest_region: { name: string; value: number };
  top_product: { name: string; value: number };
  lowest_product: { name: string; value: number };
}

interface Props {
  filters: FilterParams;
}

// getKpi's top_product/lowest_product.name come from the same short-code
// map as getByProduct (PLC, PLC+, PCC + OPC, ...). Only these three get
// relabeled; anything not listed here (Powercrete, HWP, HCG) falls through
// to its original short code via the `|| value` fallback.
const PRODUCT_LABELS: Record<string, string> = {
  "PLC": "Supercrete",
  "PLC+": "Supercrete +",
  "PCC + OPC": "Holcim",
};

export function KpiRow({ filters }: Props) {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    salesApi
      .getKpi(filters)
      .then((res) => setData(res.data))
      .catch((err) => {
        if (err.name !== "CanceledError") {
          setError("Failed to load KPIs");
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [filters]);

  if (error) {
    return (
      <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard
        label="Total Sales Volume"
        value={data ? formatNumber(data.total_sales) : "—"}
        loading={loading}
        accent="primary"
      />
      <KpiCard
        label="Total Customers"
        value={data ? data.total_customers.toLocaleString() : "—"}
        loading={loading}
        accent="info"
      />
      <KpiCard
        label="Total Territories"
        value={data ? data.total_territories.toLocaleString() : "—"}
        loading={loading}
        accent="warning"
      />
      <KpiCard
        label="Avg / Customer"
        value={data ? formatNumber(data.avg_per_customer) : "—"}
        loading={loading}
        accent="primary"
      />
      <KpiCard
        label="Top Region"
        value={data ? data.top_region.name : "—"}
        sub={data ? formatNumber(data.top_region.value) : undefined}
        loading={loading}
        accent="success"
      />
      <KpiCard
        label="Lowest Region"
        value={data ? data.lowest_region.name : "—"}
        sub={data ? formatNumber(data.lowest_region.value) : undefined}
        loading={loading}
        accent="destructive"
      />
      <KpiCard
        label="Top Product"
        value={
          data
            ? PRODUCT_LABELS[data.top_product.name] || data.top_product.name
            : "—"
        }
        sub={data ? formatNumber(data.top_product.value) : undefined}
        loading={loading}
        accent="success"
      />
      <KpiCard
        label="Lowest Product"
        value={
          data
            ? PRODUCT_LABELS[data.lowest_product.name] ||
              data.lowest_product.name
            : "—"
        }
        sub={data ? formatNumber(data.lowest_product.value) : undefined}
        loading={loading}
        accent="destructive"
      />
    </div>
  );
}