import { useState } from "react";
import { KpiRow } from "../components/shared/kpiRow";
import { RegionChart } from "../components/charts/RegionChart";
import { ProductMixChart } from "../components/charts/ProductMixChart";
import { ProductComparisonChart } from "../components/charts/ProductComparisonChart";
import { HeatmapChart } from "../components/charts/HeatmapChart";
import { AreaChart } from "../components/charts/AreaChart";
import { TerritoryChart } from "../components/charts/TerritoryChart";
import { TreemapChart } from "../components/charts/TreemapChart";
import { CustomerChart } from "../components/charts/CustomerChart";
import { InsightsPanel } from "../components/shared/InsightsPanel";
import { DeepInsightsPage } from "./DeepInsightsPage";
import { EmailChartModal } from "../components/shared/EmailChartModal";
import { Button } from "../components/ui/button";
import { ArrowLeft, BarChart2, Layers, ImageDown } from "lucide-react";
import type { FilterParams } from "../api/salesApi";

interface Props {
  uploadDate: string;
  onBack: () => void;
  onEmailSent: () => void; // ← called when email sent successfully
}

type Tab = "dashboard" | "deep";

export function AdminReportPage({ uploadDate, onBack, onEmailSent }: Props) {
  const [filters] = useState<FilterParams>({ date: uploadDate });
  const [showChartEmailModal, setShowChartEmailModal] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 bg-background border-b px-3 sm:px-4 py-2.5 sm:py-3 space-y-2 sm:space-y-3">
        {/* Row 1: back / title / send */}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Back to Upload</span>
          </Button>

          <span className="text-xs sm:text-sm font-semibold truncate text-center flex-1 sm:flex-none">
            Report — {uploadDate}
          </span>

          <Button
            onClick={() => setShowChartEmailModal(true)}
            size="sm"
            className="flex items-center gap-1.5 sm:gap-2 shrink-0"
          >
            <ImageDown className="h-4 w-4" />
            <span className="hidden sm:inline">Send Report</span>
          </Button>
        </div>

        {/* Row 2: Tab switcher */}
        <div className="flex rounded-lg border overflow-hidden text-xs sm:text-sm w-full sm:w-fit">
          <button
            type="button"
            className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 transition-colors ${
              activeTab === "dashboard"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted text-foreground"
            }`}
            onClick={() => setActiveTab("dashboard")}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            Dashboard
          </button>
          <button
            type="button"
            className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 transition-colors ${
              activeTab === "deep"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted text-foreground"
            }`}
            onClick={() => setActiveTab("deep")}
          >
            <Layers className="h-3.5 w-3.5" />
            Deep Insights
          </button>
        </div>
      </div>

      {/* Dashboard tab */}
      {activeTab === "dashboard" && (
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6 overflow-x-hidden">
          <KpiRow filters={filters} />
          <InsightsPanel filters={filters} />

          <div id="chart-region" className="overflow-x-auto">
            <RegionChart filters={filters} />
          </div>

          <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
            <div id="chart-product-mix" className="overflow-x-auto">
              <ProductMixChart filters={filters} />
            </div>
            <div id="chart-product-comparison" className="overflow-x-auto">
              <ProductComparisonChart filters={filters} />
            </div>
          </div>

          <div id="chart-heatmap" className="overflow-x-auto">
            <HeatmapChart filters={filters} />
          </div>

          <div id="chart-area" className="overflow-x-auto">
            <AreaChart filters={filters} />
          </div>

          <div id="chart-territory" className="overflow-x-auto">
            <TerritoryChart filters={filters} />
          </div>

          <div id="chart-treemap" className="overflow-x-auto">
            <TreemapChart filters={filters} />
          </div>

          <div id="chart-customer" className="overflow-x-auto">
            <CustomerChart filters={filters} />
          </div>
        </div>
      )}

      {/* Deep Insights tab */}
      {activeTab === "deep" && <DeepInsightsPage filters={filters} />}

      {/* Chart Email Modal */}
      {showChartEmailModal && (
        <EmailChartModal
          open={showChartEmailModal}
          onClose={() => setShowChartEmailModal(false)}
          onEmailSent={onEmailSent}
          filters={filters}
        />
      )}
    </div>
  );
}