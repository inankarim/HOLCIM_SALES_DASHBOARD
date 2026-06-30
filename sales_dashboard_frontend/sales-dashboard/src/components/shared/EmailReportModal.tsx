import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import {
  Mail,
  Download,
  CheckCircle2,
  AlertCircle,
  ImageDown,
  Info,
  Loader2,
} from "lucide-react";
import { formatNumber } from "../../lib/formatNumber";
import { exportChartToPng } from "../../lib/exportPng";
import DOMPurify from "dompurify";
import type { FilterParams } from "../../api/salesApi";

// Tab type mirrors AdminReportPage — kept local to avoid a circular import.
type Tab = "dashboard" | "deep";

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  kpiData: any;
  insightsData: any;
  deepInsightsData: any;   // ← new: full response from salesApi.getDeepInsights()
  filters: FilterParams;
  activeTab: Tab;
  onSwitchTab: (tab: Tab) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD CHART REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

const DASHBOARD_CHARTS = [
  { id: "chart-region",             filename: "Region-Performance.png",     label: "Region Performance" },
  { id: "chart-product-mix",        filename: "Product-Mix.png",            label: "Product Mix" },
  { id: "chart-product-comparison", filename: "Product-Comparison.png",     label: "Product Comparison" },
  { id: "chart-heatmap",            filename: "Region-Product-Heatmap.png", label: "Region × Product Heatmap" },
  { id: "chart-area",               filename: "Area-Performance.png",       label: "Area Performance" },
  { id: "chart-territory",          filename: "Territory-Ranking.png",      label: "Territory Ranking" },
  { id: "chart-treemap",            filename: "Territory-Treemap.png",      label: "Territory Treemap" },
  { id: "top5-chart",               filename: "Top-5-Customers.png",        label: "Top 5 Customers" },
  { id: "bottom5-chart",            filename: "Bottom-5-Customers.png",     label: "Bottom 5 Customers" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// DOM ID VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

function validateChartIds(): { found: string[]; missing: string[] } {
  const found: string[] = [];
  const missing: string[] = [];
  for (const chart of DASHBOARD_CHARTS) {
    if (document.getElementById(chart.id)) found.push(chart.id);
    else missing.push(chart.id);
  }
  return { found, missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const sanitizeText = (val: any): string => {
  if (val === null || val === undefined) return "N/A";
  return DOMPurify.sanitize(String(val).replace(/[\r\n<>]/g, " ").trim()).slice(0, 200);
};

const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

// ─────────────────────────────────────────────────────────────────────────────
// MODAL HIDE / RESTORE
// ─────────────────────────────────────────────────────────────────────────────

function hideModal(): () => void {
  const overlay = document.querySelector("[data-radix-dialog-overlay]") as HTMLElement | null;
  const content = document.querySelector("[data-radix-dialog-content]") as HTMLElement | null;

  const prevOV = overlay?.style.visibility    ?? "";
  const prevCV = content?.style.visibility    ?? "";
  const prevOP = overlay?.style.pointerEvents ?? "";
  const prevCP = content?.style.pointerEvents ?? "";

  if (overlay) { overlay.style.visibility = "hidden"; overlay.style.pointerEvents = "none"; }
  if (content) { content.style.visibility = "hidden"; content.style.pointerEvents = "none"; }

  return () => {
    if (overlay) { overlay.style.visibility = prevOV; overlay.style.pointerEvents = prevOP; }
    if (content) { content.style.visibility = prevCV; content.style.pointerEvents = prevCP; }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL BODY BUILDER
// Renders deep-insights tables as plain-text ASCII so they appear inline in
// the Gmail compose window — no image attachments needed for this section.
// ─────────────────────────────────────────────────────────────────────────────

/** Render a list of rows as a simple numbered plain-text table. */
function renderTable(
  rows: any[] | undefined,
  nameKey: string,
  extraKeys: Array<{ key: string; label: string; format?: (v: any) => string }>,
): string[] {
  if (!rows || rows.length === 0) return ["  (no data)"];
  return rows.map((row, i) => {
    const name  = sanitizeText(row[nameKey]);
    const extras = extraKeys
      .map(({ key, label, format }) => {
        const val = format ? format(row[key]) : sanitizeText(row[key]);
        return `${label}: ${val}`;
      })
      .join("  |  ");
    return `  ${i + 1}. ${name}  —  ${extras}`;
  });
}

function buildGmailUrl(
  to: string,
  filters: FilterParams,
  kpiData: any,
  insightsData: any,
  deepInsightsData: any,
  downloadedCount: number,
): string {
  const date = sanitizeText(filters?.date) || "Latest";
  const d    = deepInsightsData;           // shorthand; may be null if not yet loaded
  const conc = d?.risks?.customer_concentration;

  // ── Bottom-5 table helpers ────────────────────────────────────────────────
  const salesCol = [{ key: "total", label: "Sales", format: formatNumber }];
  const custCol  = [{ key: "customers", label: "Customers" }];

  const bottom5TsmRows   = renderTable(d?.failures?.bottom5_tsm_tse,   "tsm_tse",      [...custCol, ...salesCol]);
  const bottom5AsmRows   = renderTable(d?.failures?.bottom5_asm_kam,   "asm_kam",      [...custCol, ...salesCol]);
  const bottom5RsmRows   = renderTable(d?.failures?.bottom5_rsm,       "rsm_b2b_head", [...custCol, ...salesCol]);
  const bottom5TerRows   = renderTable(d?.failures?.bottom5_territories, "territory",  [
    { key: "region",    label: "Region" },
    { key: "customers", label: "Customers" },
    { key: "total",     label: "Sales", format: formatNumber },
  ]);

  // ── Assemble lines ────────────────────────────────────────────────────────
  const lines: string[] = [
    `Sales KPI Report — ${date}`,
    `Dear vhiya`,

    `Today's Sales Report,`,
    ``,
    `════════════════════════════════════`,
    `  KEY METRICS`,
    `════════════════════════════════════`,
    `Total Sales      : ${sanitizeText(kpiData ? formatNumber(kpiData.total_sales) : "N/A")}`,
    `Total Customers  : ${sanitizeText(kpiData?.total_customers)}`,
    `Total Territories: ${sanitizeText(kpiData?.total_territories)}`,
    `Avg per Customer : ${sanitizeText(kpiData ? formatNumber(kpiData.avg_per_customer) : "N/A")}`,
    ``,
    `TOP PERFORMERS`,
    `Top Region  : ${sanitizeText(kpiData?.top_region?.name)} (${sanitizeText(kpiData ? formatNumber(kpiData.top_region?.value) : "N/A")})`,
    `Top Product : ${sanitizeText(kpiData?.top_product?.name)} (${sanitizeText(kpiData ? formatNumber(kpiData.top_product?.value) : "N/A")})`,
    ``,
    `LOWEST PERFORMERS`,
    `Lowest Region  : ${sanitizeText(kpiData?.lowest_region?.name)} (${sanitizeText(kpiData ? formatNumber(kpiData.lowest_region?.value) : "N/A")})`,
    `Lowest Product : ${sanitizeText(kpiData?.lowest_product?.name)} (${sanitizeText(kpiData ? formatNumber(kpiData.lowest_product?.value) : "N/A")})`,
    ``,
    `INSIGHTS`,
    `Best Region       : ${sanitizeText(insightsData?.best_region?.name)}`,
    `Weakest Territory : ${sanitizeText(insightsData?.weakest_territory?.name)}`,
    `Top Customer      : ${sanitizeText(insightsData?.top_customer?.name)}`,
    ``,
    `════════════════════════════════════`,
    `  DEEP INSIGHTS — BOTTOM PERFORMERS`,
    `════════════════════════════════════`,
    ``,
    `▼ Bottom 5 TSM/TSE`,
    `────────────────────`,
    ...bottom5TsmRows,
    ``,
    `▼ Bottom 5 ASM/KAM`,
    `────────────────────`,
    ...bottom5AsmRows,
    ``,
    `▼ Bottom 5 RSM/B2B Head`,
    `────────────────────────`,
    ...bottom5RsmRows,
    ``,
    `▼ Bottom 5 Territories`,
    `────────────────────────`,
    ...bottom5TerRows,
    ``,
    `════════════════════════════════════`,
    `  CUSTOMER CONCENTRATION RISK`,
    `════════════════════════════════════`,
    conc
      ? [
          `Top  5 customers : ${conc.top5_pct}%  of revenue`,
          `Top 10 customers : ${conc.top10_pct}% of revenue`,
          `Top 20 customers : ${conc.top20_pct}% of revenue`,
          ``,
          `Assessment: ${sanitizeText(conc.message)}`,
        ].join("\n")
      : "  (deep insights data not loaded)",
    ``,
    `════════════════════════════════════`,
    `  ATTACHMENTS`,
    `════════════════════════════════════`,
    downloadedCount > 0
      ? `${downloadedCount} chart PNG file${downloadedCount !== 1 ? "s" : ""} downloaded to your device.\nPlease attach them from your Downloads folder before sending.`
      : `No chart images were downloaded for this report.`,
    ``,
    `— Sales KPI Dashboard`,
    `Best Regards`,

    `Inan Karim Chowdhury`,
    `Intern, Digital Projects`,
    `LafargeHolcim Bangladesh PLC`,

    `NinaKabbo, Level-7, 227/A`,
    `Bir Uttam Mir Shawkat Sarak, Tejgaon,`,
    `Dhaka- 1208, Bangladesh.`,
   

    

    `www.lafargeholcim.com.bd`
  ];

  const subject = encodeURIComponent(`Sales KPI Report — ${date}`);
  const body    = encodeURIComponent(lines.join("\n"));
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${subject}&body=${body}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type ChartStatus = "pending" | "downloading" | "done" | "skipped" | "failed";
type ModalStatus = "idle" | "validating" | "downloading" | "done" | "error";

interface ChartState {
  id: string;
  label: string;
  status: ChartStatus;
}

interface DownloadResult {
  downloaded: number;
  skipped: string[];
  failed: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function EmailReportModal({
  open,
  onClose,
  kpiData,
  insightsData,
  deepInsightsData,
  filters,
  activeTab: _activeTab,
  onSwitchTab: _onSwitchTab,
}: Props) {
  const [selected, setSelected] = useState<string[]>(DASHBOARD_CHARTS.map((c) => c.id));
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailError, setEmailError]         = useState("");
  const [toInput, setToInput]               = useState("");
  const [toList, setToList]                 = useState<string[]>([]);
  const [toInputError, setToInputError]     = useState("");
  const [status, setStatus]                         = useState<ModalStatus>("idle");
  const [progress, setProgress]                     = useState(0);
  const [progressMsg, setProgressMsg]               = useState("");
  const [chartStates, setChartStates]               = useState<ChartState[]>([]);
  const [result, setResult]                         = useState<DownloadResult | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  const isAllSelected = selected.length === DASHBOARD_CHARTS.length;
  const isDownloading = status === "downloading" || status === "validating";

  // ── helpers ───────────────────────────────────────────────────────────────

  const toggleChart = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  const selectAll   = () => setSelected(DASHBOARD_CHARTS.map((c) => c.id));
  const deselectAll = () => setSelected([]);
  const isBusy = isDownloading;

  const addEmailToList = () => {
    const clean = DOMPurify.sanitize(toInput.trim().replace(/,$/, ""));
    if (!clean) return;
    if (!isValidEmail(clean)) { setToInputError("Invalid email address"); return; }
    if (toList.includes(clean)) { setToInputError("Already added"); return; }
    setToList((prev) => [...prev, clean]);
    setToInput("");
    setToInputError("");
    // keep recipientEmail in sync so runDownload/openGmailOnly still work
    setRecipientEmail(clean);
  };

  const removeEmail = (email: string) => {
    const next = toList.filter((e) => e !== email);
    setToList(next);
    setRecipientEmail(next[0] ?? "");
  };

  const handleToKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", ",", " ", "Tab"].includes(e.key)) {
      e.preventDefault();
      addEmailToList();
    }
  };

  const updateChartStatus = (id: string, s: ChartStatus) =>
    setChartStates((prev) => prev.map((c) => (c.id === id ? { ...c, status: s } : c)));

  // ── validate IDs ──────────────────────────────────────────────────────────

  const handleValidate = () => {
    setStatus("validating");
    setValidationWarnings([]);
    setTimeout(() => {
      const { missing } = validateChartIds();
      setValidationWarnings(missing);
      setStatus("idle");
    }, 400);
  };

  // ── core download ─────────────────────────────────────────────────────────

  const runDownload = async (openGmail: boolean) => {
    const cleanEmail = DOMPurify.sanitize(recipientEmail.trim());
    if (openGmail && !isValidEmail(cleanEmail)) {
      setEmailError("Enter a valid email address.");
      return;
    }

    const chartIds = selected.length > 0 ? selected : DASHBOARD_CHARTS.map((c) => c.id);

    setChartStates(
      chartIds.map((id) => ({
        id,
        label: DASHBOARD_CHARTS.find((c) => c.id === id)!.label,
        status: "pending",
      })),
    );
    setStatus("downloading");
    setResult(null);
    setProgress(0);
    setProgressMsg("Starting download…");

    const dlResult: DownloadResult = { downloaded: 0, skipped: [], failed: [] };
    const total = chartIds.length;
    let done = 0;

    for (const id of chartIds) {
      updateChartStatus(id, "downloading");
      setProgressMsg(`Downloading: ${DASHBOARD_CHARTS.find((c) => c.id === id)!.label}`);

      const el = document.getElementById(id);

      if (!el) {
        console.warn(`[EmailReport] Chart not found in DOM: #${id}`);
        dlResult.skipped.push(id);
        updateChartStatus(id, "skipped");
        done++;
        setProgress(Math.round((done / total) * 100));
        continue;
      }

      const restoreModal = hideModal();
      try {
        await sleep(80);
        const chart = DASHBOARD_CHARTS.find((c) => c.id === id)!;
        await exportChartToPng(el, chart.filename);
        dlResult.downloaded++;
        updateChartStatus(id, "done");
      } catch (err) {
        console.error(`[EmailReport] Export failed for #${id}:`, err);
        dlResult.failed.push(id);
        updateChartStatus(id, "failed");
      } finally {
        restoreModal();
      }

      done++;
      setProgress(Math.round((done / total) * 100));
      await sleep(200);
    }

    setResult(dlResult);
    setProgressMsg("");

    if (dlResult.downloaded === 0 && selected.length > 0) {
      setStatus("error");
      return;
    }

    setStatus("done");

    if (openGmail) {
      await sleep(300);
      const gmailUrl = buildGmailUrl(
        cleanEmail,
        filters,
        kpiData,
        insightsData,
        deepInsightsData,   // ← passed through to the body builder
        dlResult.downloaded,
      );
      window.open(gmailUrl, "_blank", "noopener,noreferrer");
    }
  };

  // ── open Gmail without downloading any charts ─────────────────────────────

  const openGmailOnly = () => {
    const cleanEmail = DOMPurify.sanitize(recipientEmail.trim());
    if (!isValidEmail(cleanEmail)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    const gmailUrl = buildGmailUrl(
      cleanEmail,
      filters,
      kpiData,
      insightsData,
      deepInsightsData,
      0,
    );
    window.open(gmailUrl, "_blank", "noopener,noreferrer");
  };

  // ── per-row status icon ───────────────────────────────────────────────────

  const ChartRowIcon = ({ s }: { s: ChartStatus }) => {
    if (s === "downloading") return <Loader2      className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />;
    if (s === "done")        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    if (s === "skipped")     return <AlertCircle  className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
    if (s === "failed")      return <AlertCircle  className="h-3.5 w-3.5 text-destructive shrink-0" />;
    return <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0 inline-block" />;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isDownloading) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Send Sales Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">

          {/* ── Recipient ─────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
  <Label>Recipients *</Label>
        <div className={`flex flex-wrap gap-1.5 rounded-md border px-2 py-1.5 min-h-[42px] focus-within:ring-1 focus-within:ring-ring ${
                toInputError ? "border-destructive" : ""
              } ${isBusy ? "opacity-50 pointer-events-none" : ""}`}
            >
              {toList.map((email) => (
                <span
                  key={email}
                  className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="hover:text-destructive leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                className="outline-none flex-1 min-w-[180px] text-sm bg-transparent py-0.5"
                placeholder={toList.length === 0 ? "boss@company.com, press Enter or comma to add" : "Add another…"}
                value={toInput}
                onChange={(e) => { setToInput(e.target.value); setToInputError(""); }}
                onKeyDown={handleToKeyDown}
                onBlur={addEmailToList}
                disabled={isBusy}
              />
            </div>
            {toInputError && (
              <p className="text-xs text-destructive">{toInputError}</p>
            )}
          </div>

          {/* ── What's included in the email body ────────────────────────── */}
          {(status === "idle" || status === "validating") && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs space-y-1 text-muted-foreground">
              <p className="font-semibold text-foreground text-[11px] uppercase tracking-wide mb-1.5">
                Email body includes
              </p>
              <p>✓ Key metrics &amp; top / lowest performers</p>
              <p>✓ Bottom 5 TSM/TSE, ASM/KAM, RSM/B2B Head</p>
              <p>✓ Bottom 5 Territories</p>
              <p>✓ Customer Concentration Risk (Top 5 / 10 / 20)</p>
              {!deepInsightsData && (
                <p className="text-yellow-600 dark:text-yellow-400 mt-1">
                  ⚠ Deep Insights not yet loaded — visit the Deep Insights tab first for full data.
                </p>
              )}
            </div>
          )}

          {/* ── Chart selection ───────────────────────────────────────────── */}
          {(status === "idle" || status === "validating") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Chart images to attach ({selected.length} / {DASHBOARD_CHARTS.length})
                </Label>
                <div className="flex gap-2 items-center">
                  <button className="text-xs text-primary hover:underline" onClick={selectAll}>All</button>
                  <span className="text-xs text-muted-foreground">|</span>
                  <button className="text-xs text-muted-foreground hover:underline" onClick={deselectAll}>None</button>
                  <span className="text-xs text-muted-foreground">|</span>
                  <button
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    onClick={handleValidate}
                    title="Check which chart IDs are present in the DOM right now"
                  >
                    <Info className="h-3 w-3" />
                    Check IDs
                  </button>
                </div>
              </div>

              {validationWarnings.length > 0 && (
                <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400 space-y-1">
                  <p className="font-semibold">
                    ⚠️ {validationWarnings.length} ID{validationWarnings.length !== 1 ? "s" : ""} not found in DOM:
                  </p>
                  {validationWarnings.map((id) => (
                    <p key={id} className="font-mono pl-2">#{id}</p>
                  ))}
                  <p className="mt-1">These will be skipped. Make sure the dashboard is fully loaded.</p>
                </div>
              )}

              <div className="rounded-lg border p-3 space-y-0.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 pt-1 pb-1">
                  Dashboard charts — {DASHBOARD_CHARTS.length} total
                </p>
                {DASHBOARD_CHARTS.map((chart) => (
                  <label
                    key={chart.id}
                    className="flex items-center gap-2.5 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(chart.id)}
                      onChange={() => toggleChart(chart.id)}
                      className="h-4 w-4 rounded accent-primary"
                    />
                    <span className="text-sm flex-1">{chart.label}</span>
                    <code className="text-[10px] text-muted-foreground shrink-0">#{chart.id}</code>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ── Live download progress ────────────────────────────────────── */}
          {(status === "downloading" || status === "done" || status === "error") && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-muted-foreground truncate pr-2">
                    {status === "downloading" ? progressMsg : status === "done" ? "All done!" : "Download failed"}
                  </span>
                  <span className={
                    status === "done"  ? "text-green-600 dark:text-green-400" :
                    status === "error" ? "text-destructive" : "text-primary"
                  }>
                    {progress}%
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                      status === "done"  ? "bg-green-500" :
                      status === "error" ? "bg-destructive" : "bg-primary"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="rounded-lg border divide-y divide-border">
                {chartStates.map((cs) => (
                  <div
                    key={cs.id}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      cs.status === "downloading" ? "bg-primary/5" : ""
                    }`}
                  >
                    <ChartRowIcon s={cs.status} />
                    <span className={`flex-1 ${
                      cs.status === "pending"  ? "text-muted-foreground" :
                      cs.status === "done"     ? "text-green-700 dark:text-green-400" :
                      cs.status === "failed"   ? "text-destructive" :
                      cs.status === "skipped"  ? "text-yellow-600 dark:text-yellow-400" :
                                                 "text-foreground font-medium"
                    }`}>
                      {cs.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0 capitalize">
                      {cs.status !== "pending" ? cs.status : ""}
                    </span>
                  </div>
                ))}
              </div>

              {status === "done" && result && (
                <div className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {result.downloaded} chart{result.downloaded !== 1 ? "s" : ""} downloaded — Gmail has been opened.
                    </p>
                    {result.skipped.length > 0 && (
                      <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-0.5">
                        {result.skipped.length} skipped (not in DOM): {result.skipped.join(", ")}
                      </p>
                    )}
                    {result.failed.length > 0 && (
                      <p className="text-red-600 dark:text-red-400 text-xs mt-0.5">
                        {result.failed.length} failed: {result.failed.join(", ")}
                      </p>
                    )}
                    <p className="text-xs mt-1 opacity-80">
                      Attach the PNGs from your Downloads folder before sending.
                    </p>
                  </div>
                </div>
              )}

              {status === "error" && result && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">No charts could be downloaded.</p>
                    {result.skipped.length > 0 && (
                      <p className="text-xs mt-0.5">Not found in DOM: {result.skipped.join(", ")}</p>
                    )}
                    {result.failed.length > 0 && (
                      <p className="text-xs mt-0.5">Export errors: {result.failed.join(", ")}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Info banner (idle only) ───────────────────────────────────── */}
          {(status === "idle" || status === "validating") && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p className="flex items-center gap-1.5">
                <Download className="h-3 w-3 shrink-0" />
                Selected charts download as PNG files to your device
              </p>
              <p className="flex items-center gap-1.5">
                <Mail className="h-3 w-3 shrink-0" />
                Gmail opens automatically once all downloads finish
              </p>
            </div>
          )}

          {/* ── Action buttons ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">

            {/* Download charts only */}
            <Button
              variant="outline"
              className="w-full flex items-center gap-2"
              onClick={() => runDownload(false)}
              disabled={isDownloading || selected.length === 0}
            >
              {status === "downloading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
              {status === "downloading"
                ? `Downloading… ${progress}%`
                : `Download ${isAllSelected ? "All 9" : selected.length} Chart${selected.length !== 1 ? "s" : ""} as PNG`}
            </Button>

            {/* Download charts + open Gmail */}
            <Button
              className="w-full flex items-center gap-2"
              onClick={() => runDownload(true)}
              disabled={isDownloading || toList.length === 0 || !!emailError || selected.length === 0}
            >
              {status === "downloading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {status === "downloading"
                ? `Downloading… ${progress}%`
                : `Download ${isAllSelected ? "All 9" : selected.length} Chart${selected.length !== 1 ? "s" : ""} & Open Gmail`}
            </Button>

            {/* Open Gmail without downloading — email body only */}
            <Button
              variant="secondary"
              className="w-full flex items-center gap-2"
              onClick={openGmailOnly}
             disabled={isDownloading || toList.length === 0 || !!emailError}
            >
              <Mail className="h-4 w-4" />
              Open Gmail (email body only, no images)
            </Button>

            <Button variant="ghost" onClick={onClose} disabled={isDownloading}>
              {status === "done" || status === "error" ? "Close" : "Cancel"}
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}