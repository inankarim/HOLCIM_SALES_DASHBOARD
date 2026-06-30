import { useState, useCallback, useRef } from "react";
import { salesApi } from "../api/salesApi";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Upload, FileSpreadsheet, AlertCircle,
  CheckCircle2, Calendar, BarChart3,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { AdminReportPage } from "./AdminReportPage";
import DOMPurify from "dompurify";

// ── simple self-dismissing toast ──────────────────────────────────────────────
function Toast({
  message,
  onDone,
}: {
  message: string;
  onDone: () => void;
}) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-green-600 text-white text-sm font-medium px-5 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-4"
      style={{ animationDuration: "250ms" }}
      onAnimationEnd={() => {
        // auto-dismiss after 3 s
        setTimeout(onDone, 3000);
      }}
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadDate, setUploadDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingDate, setPendingDate] = useState("");
  const [showAdminReport, setShowAdminReport] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const submitCount = useRef(0);
  const lastSubmitTime = useRef(0);

  const today = new Date().toISOString().slice(0, 10);

  const isRateLimited = (): boolean => {
    const now = Date.now();
    if (now - lastSubmitTime.current < 60000) {
      submitCount.current += 1;
      if (submitCount.current > 3) return true;
    } else {
      submitCount.current = 1;
      lastSubmitTime.current = now;
    }
    return false;
  };

  const handleFile = useCallback((f: File) => {
    setError(null);
    setSuccess(null);
    setFile(f);
  }, []);

  const performUpload = async (uploadFile: File, cleanDate: string) => {
    setLoading(true);
    try {
      const res = await salesApi.uploadFile(uploadFile, cleanDate);
      const safeSuccess = {
        upload_date: DOMPurify.sanitize(String(res.data.upload_date ?? "")),
        rows_inserted: Number(res.data.rows_inserted ?? 0),
        months_archived: Number(res.data.months_archived ?? 0),
      };
      setSuccess(safeSuccess);
      setFile(null);
      setUploadDate("");
    } catch (err: any) {
      const rawError = err.message || err.response?.data?.error || "Upload failed.";
      setError(DOMPurify.sanitize(String(rawError).slice(0, 200)));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (isRateLimited()) {
      setError("Too many uploads. Please wait a moment before trying again.");
      return;
    }

    if (!file) {
      setError("Please select a file.");
      return;
    }

    const cleanDate = DOMPurify.sanitize(uploadDate.trim());
    if (!cleanDate) {
      setError("Please select a date.");
      return;
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(cleanDate)) {
      setError("Invalid date format.");
      return;
    }

    if (cleanDate > today) {
      setError("Upload date cannot be in the future.");
      return;
    }

    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - 5);
    if (new Date(cleanDate) < minDate) {
      setError("Upload date is too old. Maximum 5 years back.");
      return;
    }

    // Check if date already exists
    try {
      const datesRes = await salesApi.getDates();
      const existingDates: string[] = datesRes.data.dates || [];
      if (existingDates.includes(cleanDate)) {
        setPendingFile(file);
        setPendingDate(cleanDate);
        setShowOverwriteDialog(true);
        return;
      }
    } catch {
      // If check fails proceed with upload
    }

    await performUpload(file, cleanDate);
  };

  // ── back from AdminReportPage with no email sent — just go back silently ──
  const handleBackFromReport = () => {
    setShowAdminReport(false);
    setSuccess(null);
    setFile(null);
    setUploadDate("");
    setError(null);
    // no toast — user just pressed Back
  };

  // ── email was actually sent — go back and show success toast ──────────────
  const handleEmailSent = () => {
    setShowAdminReport(false);
    setSuccess(null);
    setFile(null);
    setUploadDate("");
    setError(null);
    setToast("Email sent successfully! Ready for the next upload.");
  };

  // Show admin report page
  if (showAdminReport && success) {
    return (
      <AdminReportPage
        uploadDate={success.upload_date}
        onBack={handleBackFromReport}
        onEmailSent={handleEmailSent}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl space-y-4">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Upload Sales Data</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload a CSV or XLSX file with sales data
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">File Upload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Date picker */}
            <div className="space-y-1.5">
              <Label htmlFor="upload-date" className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                Upload Date
              </Label>
              <Input
                id="upload-date"
                type="date"
                max={today}
                min={(() => {
                  const d = new Date();
                  d.setFullYear(d.getFullYear() - 5);
                  return d.toISOString().slice(0, 10);
                })()}
                value={uploadDate}
                onChange={(e) => setUploadDate(e.target.value)}
                className="max-w-xs"
                maxLength={10}
              />
            </div>

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                {file ? (
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileSpreadsheet className="h-4 w-4 text-primary" />
                    {DOMPurify.sanitize(file.name).slice(0, 50)}
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium">Drop your file here</p>
                    <p className="text-xs text-muted-foreground">
                      CSV or XLSX only, max 10MB
                    </p>
                  </>
                )}
              </div>
              <input
                id="file-input"
                type="file"
                accept=".csv,.xlsx"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex flex-col gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Upload Successful!
                </div>
                <p>Date: {success.upload_date}</p>
                <p>Rows inserted: {success.rows_inserted.toLocaleString()}</p>
                <p>Months archived: {success.months_archived}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSubmit}
                disabled={loading || !file || !uploadDate}
                className="w-full"
              >
                {loading ? "Uploading..." : "Upload File"}
              </Button>

              {success && (
                <Button
                  variant="outline"
                  className="w-full flex items-center gap-2"
                  onClick={() => setShowAdminReport(true)}
                >
                  <BarChart3 className="h-4 w-4" />
                  View Report &amp; Send Email
                </Button>
              )}
            </div>

          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Files are scanned and validated before processing.
          Maximum 3 uploads per minute.
        </p>

        {/* Overwrite Confirmation */}
        <AlertDialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Date Already Exists</AlertDialogTitle>
              <AlertDialogDescription>
                Data for <strong>{pendingDate}</strong> already exists in the
                system. Uploading again will permanently replace all existing
                data for this date. Are you sure you want to overwrite it?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setShowOverwriteDialog(false);
                  setPendingFile(null);
                  setPendingDate("");
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  setShowOverwriteDialog(false);
                  if (pendingFile && pendingDate) {
                    await performUpload(pendingFile, pendingDate);
                  }
                  setPendingFile(null);
                  setPendingDate("");
                }}
              >
                Yes, Overwrite
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}