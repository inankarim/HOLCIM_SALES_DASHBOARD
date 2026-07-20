import { KpiRow } from "../components/shared/kpiRow";
import { RegionChart } from "../components/charts/RegionChart";
import { ProductMixChart } from "../components/charts/ProductMixChart";
import { ProductComparisonChart } from "../components/charts/ProductComparisonChart";
import { TargetAttainmentChart } from "../components/charts/ Targetattainmentchart";
import { HeatmapChart } from "../components/charts/HeatmapChart";
import { AreaChart } from "../components/charts/AreaChart";
import { TerritoryChart } from "../components/charts/TerritoryChart";
import { TreemapChart } from "../components/charts/TreemapChart";
import { CustomerChart } from "../components/charts/CustomerChart";
import { InsightsPanel } from "../components/shared/InsightsPanel";
import type { FilterParams } from "../api/salesApi";

interface Props {
  filters: FilterParams;
}



export function DashboardPage({ filters }: Props) {

  return (
    <div className="space-y-6">
      <div className="hidden md:block">
        <h1 className="text-xl font-bold">Sales KPI & MIS Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {filters.date ? `Date: ${filters.date}` : "Latest available data"}
        </p>
      </div>

      <KpiRow filters={filters} />
      <InsightsPanel filters={filters} />
      <div id="chart-region">
      <RegionChart filters={filters} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div id="chart-product-mix">
          <ProductMixChart filters={filters} />
        </div>
        <div id="chart-product-comparison">
          <ProductComparisonChart filters={filters} />
        </div>
      </div>

      <div id="chart-target-attainment">
        <TargetAttainmentChart filters={filters} />
      </div>

      <div id="chart-heatmap">
        <HeatmapChart filters={filters} />
      </div>

      <div id="chart-area">
        <AreaChart filters={filters} />
      </div>

      <div id="chart-territory">
        <TerritoryChart filters={filters} />
      </div>

      <div id="chart-treemap">
        <TreemapChart filters={filters} />
      </div>

      <div id="chart-customer">
        <CustomerChart filters={filters} />
      </div>
    </div>
  );
}