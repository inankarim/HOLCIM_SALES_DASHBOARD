import { useState } from "react";
import { salesApi } from "../api/salesApi";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Calendar, AlertTriangle } from "lucide-react";
import DOMPurify from "dompurify";

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function monthValueToDate(monthValue: string): string {
  return `${monthValue}-01`;
}
function dateToMonthValue(date: string): string {
  return date.slice(0, 7);
}
function monthLabel(monthValue: string): string {
  const [y, m] = monthValue.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function TargetUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [monthValue, setMonthValue] = useState(dateToMonthValue(currentMonthStart()));
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any | null>(null);

  // When a month already has data, we pause here instead of uploading
  // immediately — existingRowCount drives the confirmation banner, and
  // confirming calls doUpload() directly instead of re-checking.
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [existingRowCount, setExistingRowCount] = useState(0);

  const maxMonth = dateToMonthValue(currentMonthStart()); // blocks any future month

  const doUpload = async (targetMonth: string) => {
    setLoading(true);
    try {
      const res = await salesApi.uploadTargets(file as File, targetMonth);
      setSuccess({
        target_month: DOMPurify.sanitize(String(res.data.target_month ?? "")),
        rows_inserted: Number(res.data.rows_inserted ?? 0),
        skipped_non_target_rows: Number(res.data.skipped_non_target_rows ?? 0),
      });
      setFile(null);
      setConfirmOverwrite(false);
    } catch (err: any) {
      const rawError = err.response?.data?.error || err.message || "Upload failed.";
      setError(DOMPurify.sanitize(String(rawError).slice(0, 200)));
      setConfirmOverwrite(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    setConfirmOverwrite(false);

    if (!file) {
      setError("Please select a target file.");
      return;
    }
    if (!monthValue) {
      setError("Please select a month.");
      return;
    }

    const targetMonth = monthValueToDate(monthValue);
    if (targetMonth > currentMonthStart()) {
      setError("Target month cannot be in the future.");
      return;
    }

    setChecking(true);
    try {
      const res = await salesApi.checkTargetMonth(targetMonth);
      if (res.data.exists) {
        setExistingRowCount(res.data.row_count);
        setConfirmOverwrite(true);
        setChecking(false);
        return;
      }
    } catch (err: any) {
      // If the check itself fails, don't block the upload on it — fall
      // through and let the upload's own error handling surface any
      // real problem instead of silently trapping the admin here.
    }
    setChecking(false);
    await doUpload(targetMonth);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl space-y-4">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Upload Monthly Targets</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload the target file for a given month — territory/brand targets only, no customer-level data.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Target File</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="target-month" className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                Target Month
              </Label>
              <Input
                id="target-month"
                type="month"
                max={maxMonth}
                value={monthValue}
                onChange={(e) => { setMonthValue(e.target.value); setConfirmOverwrite(false); }}
                className="max-w-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Target File</Label>
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                  dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) { setError(null); setSuccess(null); setConfirmOverwrite(false); setFile(f); }
                }}
                onClick={() => document.getElementById("target-file-input")?.click()}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Upload className="h-5 w-5 text-primary" />
                  </div>
                  {file ? (
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileSpreadsheet className="h-4 w-4 text-primary" />
                      {DOMPurify.sanitize(file.name).slice(0, 50)}
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium">Drop file here</p>
                      <p className="text-xs text-muted-foreground">.xlsx, .xls, or .csv</p>
                    </>
                  )}
                </div>
                <input
                  id="target-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setError(null); setSuccess(null); setConfirmOverwrite(false); setFile(f); }
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {confirmOverwrite && (
              <div className="flex flex-col gap-3 text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Targets already uploaded for {monthLabel(monthValue)}
                </div>
                <p>
                  {existingRowCount.toLocaleString()} existing target row{existingRowCount === 1 ? "" : "s"} will
                  be overwritten with this file's values. This can't be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmOverwrite(false)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => doUpload(monthValueToDate(monthValue))}
                    disabled={loading}
                  >
                    {loading ? "Uploading..." : "Overwrite and Upload"}
                  </Button>
                </div>
              </div>
            )}

            {success && (
              <div className="flex flex-col gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Targets Uploaded!
                </div>
                <p>Month: {success.target_month}</p>
                <p>Rows inserted/updated: {success.rows_inserted.toLocaleString()}</p>
                {success.skipped_non_target_rows > 0 && (
                  <p>Skipped (non-"Target" status) rows: {success.skipped_non_target_rows}</p>
                )}
              </div>
            )}

            {!confirmOverwrite && (
              <Button
                onClick={handleSubmit}
                disabled={loading || checking || !file || !monthValue}
                className="w-full"
              >
                {checking ? "Checking..." : loading ? "Uploading..." : "Upload Targets"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}