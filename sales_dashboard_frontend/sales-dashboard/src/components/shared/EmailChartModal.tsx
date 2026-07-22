import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ImageDown,
  Clock,
} from "lucide-react";
import { captureChartAsBase64 } from "../../lib/exportPng";
import DOMPurify from "dompurify";
import type { FilterParams } from "../../api/salesApi";
import { salesApi } from "../../api/salesApi";
import type { EmailRecipient } from "../../api/salesApi";
import http from "../../api/axios";

// ─── Chart registry ──────────────────────────────────────────────────────────
const CHART_JOBS = [
  { id: "chart-region",             label: "Region-Performance" },
  { id: "chart-product-mix",        label: "Product-Mix" },
  { id: "chart-product-comparison", label: "Product-Comparison" },
  { id: "chart-target-attainment",  label: "Target-Attainment" },
  { id: "chart-heatmap",            label: "Heatmap" },
  { id: "chart-area",               label: "Area-Performance" },
  { id: "chart-territory",          label: "Territory-Ranking" },
  { id: "chart-customer-type",      label: "Customer-Type-Sales" },
] as const;
// ↑ Customer-Analytics removed per design spec

type JobLabel = typeof CHART_JOBS[number]["label"];
type ChartStatus = "pending" | "capturing" | "done" | "failed" | "skipped";

interface ChartState {
  id: string;
  label: JobLabel;
  displayLabel: string;
  status: ChartStatus;
}

const DISPLAY_LABELS: Record<JobLabel, string> = {
  "Region-Performance":  "Region Performance",
  "Product-Mix":         "Product Mix",
  "Product-Comparison":  "Product Comparison",
  "Target-Attainment":   "Target Attainment",
  "Heatmap":             "Region × Product Heatmap",
  "Area-Performance":    "Area Performance",
  "Territory-Ranking":   "Territory Ranking",
  "Customer-Type-Sales": "Customer Type Sales",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

function hideModal(): () => void {
  const overlay = document.querySelector("[data-radix-dialog-overlay]") as HTMLElement | null;
  const content = document.querySelector("[data-radix-dialog-content]") as HTMLElement | null;

  const prevOV = overlay?.style.visibility ?? "";
  const prevCV = content?.style.visibility ?? "";
  const prevOP = overlay?.style.pointerEvents ?? "";
  const prevCP = content?.style.pointerEvents ?? "";

  if (overlay) { overlay.style.visibility = "hidden"; overlay.style.pointerEvents = "none"; }
  if (content) { content.style.visibility = "hidden"; content.style.pointerEvents = "none"; }

  return () => {
    if (overlay) { overlay.style.visibility = prevOV; overlay.style.pointerEvents = prevOP; }
    if (content) { content.style.visibility = prevCV; content.style.pointerEvents = prevCP; }
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onEmailSent: () => void; // ← called only when email actually sent successfully
  filters: FilterParams;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EmailChartModal({ open, onClose, onEmailSent, filters }: Props) {
  // ── To field — tag input ──────────────────────────────────────────────────
  const [toInput, setToInput]       = useState("");
  const [toList, setToList]         = useState<string[]>([]);
  const [toInputError, setToInputError] = useState("");

  // ── CC field ──────────────────────────────────────────────────────────────
  const [ccEmail, setCcEmail] = useState("");
  const [ccError, setCcError] = useState("");

  // ── Send status ───────────────────────────────────────────────────────────
  type Status = "idle" | "capturing" | "sending" | "done" | "error";
  const [status, setStatus]       = useState<Status>("idle");
  const [progressMsg, setProgressMsg] = useState("");
  const [progress, setProgress]   = useState(0);
  const [errorMsg, setErrorMsg]   = useState("");
  const [sentCount, setSentCount] = useState(0);

  // ── Saved email recipients ───────────────────────────────────────────────
  const [savedRecipients, setSavedRecipients] = useState<EmailRecipient[]>([]);
  const [saveThisEmail, setSaveThisEmail] = useState(false);
  const [recipientsLoading, setRecipientsLoading] = useState(true);

  const [chartStates, setChartStates] = useState<ChartState[]>(
    CHART_JOBS.map((j) => ({
      id: j.id,
      label: j.label,
      displayLabel: DISPLAY_LABELS[j.label],
      status: "pending",
    })),
  );

  const isBusy = status === "capturing" || status === "sending";

  // ── Fetch saved recipients when modal opens ──────────────────────────────

  useEffect(() => {
    if (!open) return;
    setRecipientsLoading(true);
    salesApi
      .getEmailRecipients()
      .then((res) => setSavedRecipients(res.data.recipients))
      .catch(console.error)
      .finally(() => setRecipientsLoading(false));
  }, [open]);

  // ── To field handlers ─────────────────────────────────────────────────────

  const addEmailToList = () => {
    const clean = DOMPurify.sanitize(toInput.trim().replace(/,$/, ""));
    if (!clean) return;
    if (!isValidEmail(clean)) {
      setToInputError("Invalid email address");
      return;
    }
    if (toList.includes(clean)) {
      setToInputError("Already added");
      return;
    }
    setToList((prev) => [...prev, clean]);
    setToInput("");
    setToInputError("");
  };

  const removeEmail = (email: string) => {
    setToList((prev) => prev.filter((e) => e !== email));
  };

  const handleToKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", ",", " ", "Tab"].includes(e.key)) {
      e.preventDefault();
      addEmailToList();
    }
  };

  // ── CC field handler ──────────────────────────────────────────────────────

  const validateCc = (val: string) => {
    const clean = DOMPurify.sanitize(val.trim());
    setCcEmail(clean);
    setCcError(clean && !isValidEmail(clean) ? "Invalid CC email address" : "");
  };

  // ── Chart state helper ────────────────────────────────────────────────────

  const setChartStatus = (label: JobLabel, s: ChartStatus) => {
    setChartStates((prev) =>
      prev.map((c) => (c.label === label ? { ...c, status: s } : c)),
    );
  };

  // ── Main action ───────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (toList.length === 0) {
      setToInputError("Please add at least one recipient email.");
      return;
    }
    if (ccEmail && !isValidEmail(ccEmail)) {
      setCcError("Please enter a valid CC email.");
      return;
    }

    // Reset state
    setChartStates(CHART_JOBS.map((j) => ({
      id: j.id,
      label: j.label,
      displayLabel: DISPLAY_LABELS[j.label],
      status: "pending",
    })));
    setProgress(0);
    setErrorMsg("");
    setSentCount(0);
    setStatus("capturing");

    // Hide modal so it doesn't appear in chart screenshots
    const restoreModal = hideModal();
    await new Promise((r) => setTimeout(r, 120));

    const captured: { name: string; base64: string }[] = [];

    try {
      for (let i = 0; i < CHART_JOBS.length; i++) {
        const job = CHART_JOBS[i];
        setChartStatus(job.label, "capturing");
        setProgressMsg(`Capturing ${DISPLAY_LABELS[job.label]}…`);

        const el = document.getElementById(job.id);
        if (!el) {
          setChartStatus(job.label, "skipped");
          setProgress(Math.round(((i + 1) / CHART_JOBS.length) * 75));
          continue;
        }

        try {
          const result = await captureChartAsBase64(el, job.label);
          if (result) {
            captured.push(result);
            setChartStatus(job.label, "done");
          } else {
            setChartStatus(job.label, "failed");
          }
        } catch {
          setChartStatus(job.label, "failed");
        }

        setProgress(Math.round(((i + 1) / CHART_JOBS.length) * 75));
      }
    } finally {
      restoreModal();
    }

    // ── Send to backend ───────────────────────────────────────────────────
    setStatus("sending");
    setProgressMsg("Sending email… this may take up to 60 seconds");
    setProgress(80);

    try {
      await http.post(
        "/api/email/send",
        {
          to: toList,
          cc: ccEmail || undefined,
          date: filters.date,
          charts: captured,
        },
        { timeout: 120_000 },
      );

      setSentCount(captured.length);
      setProgress(100);
      setProgressMsg("Email sent successfully!");
      setStatus("done");

      // Save recipients if checkbox was checked — fire and forget
      if (saveThisEmail && toList.length > 0) {
        Promise.all(
          toList.map((email) =>
            salesApi.addEmailRecipient(email).catch((err) =>
              console.error("Failed to save recipient", email, err)
            )
          )
        );
      }

      // Wait 1.5s so user sees the success state, then trigger navigation
      setTimeout(() => {
        onEmailSent();
      }, 1500);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Failed to send email.";
      const isTimeout = err.code === "ECONNABORTED" || msg.includes("timeout");
      setErrorMsg(
        isTimeout
          ? "Request timed out — but the email may still have been delivered. Please check the recipient's inbox before retrying."
          : msg,
      );
      setStatus("error");
      setProgress(0);
    }
  };

  // ── Icon per chart row ────────────────────────────────────────────────────

  const RowIcon = ({ s }: { s: ChartStatus }) => {
    if (s === "capturing") return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />;
    if (s === "done")      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    if (s === "failed")    return <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
    if (s === "skipped")   return <AlertCircle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
    return <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />;
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isBusy) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageDown className="h-5 w-5 text-primary" />
            Send Report with Charts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">

          {/* ── Email fields ──────────────────────────────────────────────── */}
          <div className="space-y-3">

            {/* To — tag input */}
            <div className="space-y-1.5">
              <Label>Recipients *</Label>
              <div
                className={`flex flex-wrap gap-1.5 rounded-md border px-2 py-1.5 min-h-[42px] focus-within:ring-1 focus-within:ring-ring ${
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
                  placeholder={
                    toList.length === 0
                      ? "boss@company.com — press Enter or comma to add"
                      : "Add another…"
                  }
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

            {/* Saved recipients quick-select */}
            {!recipientsLoading && savedRecipients.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Saved Recipients</Label>
                <div className="flex flex-wrap gap-1.5">
                  {savedRecipients.map((r) => (
                    <div
                      key={r.id}
                      className="group flex items-center gap-1 rounded-full border bg-muted/40 pl-2.5 pr-1 py-1 text-xs"
                    >
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          if (!toList.includes(r.email)) {
                            setToList((prev) => [...prev, r.email]);
                          }
                        }}
                        className="hover:text-primary"
                      >
                        {r.label || r.email}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={async () => {
                          try {
                            await salesApi.deleteEmailRecipient(r.id);
                            setSavedRecipients((prev) => prev.filter((x) => x.id !== r.id));
                          } catch (err) {
                            console.error("Failed to delete recipient", err);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-destructive/10 p-0.5"
                        title="Remove saved recipient"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CC */}
            <div className="space-y-1.5">
              <Label htmlFor="chart-email-cc">CC (optional)</Label>
              <Input
                id="chart-email-cc"
                type="email"
                placeholder="colleague@company.com"
                value={ccEmail}
                onChange={(e) => validateCc(e.target.value)}
                disabled={isBusy}
                className={ccError ? "border-destructive" : ""}
              />
              {ccError && (
                <p className="text-xs text-destructive">{ccError}</p>
              )}
            </div>

            {/* Save recipients checkbox */}
            {toList.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveThisEmail}
                  onChange={(e) => setSaveThisEmail(e.target.checked)}
                  disabled={isBusy}
                  className="h-3.5 w-3.5 rounded accent-primary"
                />
                Save these recipients for next time
              </label>
            )}
          </div>

          {/* ── Info banner (idle) ────────────────────────────────────────── */}
          {status === "idle" && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p className="flex items-center gap-1.5">
                <ImageDown className="h-3 w-3 shrink-0" />
                {CHART_JOBS.length} dashboard charts will be captured and embedded in the email
              </p>
              <p className="flex items-center gap-1.5">
                <Mail className="h-3 w-3 shrink-0" />
                KPI data, tables, and insights are also included
              </p>
              <p className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 shrink-0" />
                Sending may take up to 60 seconds — please do not close this window
              </p>
            </div>
          )}

          {/* ── Sending banner (slow operation warning) ───────────────────── */}
          {status === "sending" && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Embedding charts and delivering via SMTP — this can take up to 60 seconds.
                Please keep this window open.
              </span>
            </div>
          )}

          {/* ── Progress ──────────────────────────────────────────────────── */}
          {(status === "capturing" || status === "sending" || status === "done" || status === "error") && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-muted-foreground truncate pr-2">{progressMsg}</span>
                  <span className={
                    status === "done"  ? "text-green-600" :
                    status === "error" ? "text-destructive" : "text-primary"
                  }>
                    {progress}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      status === "done"    ? "bg-green-500" :
                      status === "error"  ? "bg-destructive" :
                      status === "sending" ? "bg-amber-500 animate-pulse" :
                                             "bg-primary"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Chart-by-chart status list */}
              <div className="rounded-lg border divide-y divide-border">
                {chartStates.map((cs) => (
                  <div
                    key={cs.id}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      cs.status === "capturing" ? "bg-primary/5" : ""
                    }`}
                  >
                    <RowIcon s={cs.status} />
                    <span className={`flex-1 ${
                      cs.status === "pending"   ? "text-muted-foreground" :
                      cs.status === "done"      ? "text-green-700 dark:text-green-400" :
                      cs.status === "failed"    ? "text-destructive" :
                      cs.status === "skipped"   ? "text-yellow-600" :
                                                  "text-foreground font-medium"
                    }`}>
                      {cs.displayLabel}
                    </span>
                    <span className="text-[10px] text-muted-foreground capitalize shrink-0">
                      {cs.status !== "pending" ? cs.status : ""}
                    </span>
                  </div>
                ))}
              </div>

              {/* Success message */}
              {status === "done" && (
                <div className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Email sent successfully!</p>
                    <p className="text-xs mt-0.5 opacity-80">
                      {sentCount} chart{sentCount !== 1 ? "s" : ""} embedded — sent to {toList.length} recipient{toList.length !== 1 ? "s" : ""}.
                    </p>
                    <p className="text-xs mt-1 opacity-60">Returning to upload page…</p>
                  </div>
                </div>
              )}

              {/* Error message */}
              {status === "error" && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Failed to send email</p>
                    <p className="text-xs mt-0.5">{errorMsg}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Action buttons ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            {status !== "done" && (
              <Button
                className="w-full flex items-center gap-2"
                onClick={handleSend}
                disabled={isBusy || toList.length === 0 || !!ccError}
              >
                {isBusy
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Mail className="h-4 w-4" />}
                {status === "capturing" ? `Capturing charts… ${progress}%` :
                 status === "sending"   ? "Sending email… please wait" :
                 status === "error"     ? "Retry" :
                                          "Capture Charts & Send Email"}
              </Button>
            )}

            {status !== "done" && (
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={isBusy}
              >
                {status === "error" ? "Close" : "Cancel"}
              </Button>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}