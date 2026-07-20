import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { pool } from "../config/db";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";

const MERGE_SERVICE_URL =
  process.env.MERGE_SERVICE_URL ?? "http://sales-summary-service:8000";

// Same shape used for both sales_current and sales_archived. Column names
// mirror the merge engine's product groups exactly: PLC, PLC+, Powercrete,
// PCC + OPC, HWP, HCG — each with Target / MTD Sales / Yesterday Sales /
// Achievement %. Yesterday Sales is the PRIMARY metric for the daily D-1
// report; MTD Sales and Target/Achievement % support the "vs target" /
// "month so far" views.
export interface SalesRow {
  sap_id: number;
  customer_name: string;
  customer_type: string;
  region: string;
  area: string;
  territory: string;
  tsm_tse: string;
  asm_kam: string;
  rsm_b2b_head: string;
  plc_mtd_sales: number;
  plc_plus_mtd_sales: number;
  powercrete_mtd_sales: number;
  pcc_opc_mtd_sales: number;
  hwp_mtd_sales: number;
  hcg_mtd_sales: number;
  plc_target: number;
  plc_yesterday: number;
  plc_ach: number;
  plc_plus_target: number;
  plc_plus_yesterday: number;
  plc_plus_ach: number;
  powercrete_target: number;
  powercrete_yesterday: number;
  powercrete_ach: number;
  pcc_opc_target: number;
  pcc_opc_yesterday: number;
  pcc_opc_ach: number;
  hwp_target: number;
  hwp_yesterday: number;
  hwp_ach: number;
  hcg_target: number;
  hcg_yesterday: number;
  hcg_ach: number;
}

// The merge service returns 24 numeric fields (Target/MTD Sales/Yesterday
// Sales/Achievement % × 6 products) per row — this maps each one straight
// into its matching column.
const toNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toText = (value: unknown): string =>
  typeof value === "string"
    ? value.trim()
    : value == null
      ? ""
      : String(value).trim();

const mapMergedRow = (row: Record<string, unknown>): SalesRow => ({
  sap_id: parseInt(toText(row["SAP ID"]), 10) || 0,
  customer_name: toText(row["Customer Name"]),
  customer_type: toText(row["Customer Type"]),
  region: toText(row["Region"]),
  area: toText(row["Area"]),
  territory: toText(row["Territory"]),
  tsm_tse: toText(row["TSM/TSE"]),
  asm_kam: toText(row["ASM/KAM"]),
  rsm_b2b_head: toText(row["RSM/B2B Head"]),
  plc_mtd_sales: toNumber(row["PLC - MTD Sales"]),
  plc_plus_mtd_sales: toNumber(row["PLC+ - MTD Sales"]),
  powercrete_mtd_sales: toNumber(row["Powercrete - MTD Sales"]),
  pcc_opc_mtd_sales: toNumber(row["PCC + OPC - MTD Sales"]),
  hwp_mtd_sales: toNumber(row["HWP - MTD Sales"]),
  hcg_mtd_sales: toNumber(row["HCG - MTD Sales"]),
  plc_target: toNumber(row["PLC - Target"]),
  plc_yesterday: toNumber(row["PLC - Yesterday Sales"]),
  plc_ach: toNumber(row["PLC - Achievement %"]),
  plc_plus_target: toNumber(row["PLC+ - Target"]),
  plc_plus_yesterday: toNumber(row["PLC+ - Yesterday Sales"]),
  plc_plus_ach: toNumber(row["PLC+ - Achievement %"]),
  powercrete_target: toNumber(row["Powercrete - Target"]),
  powercrete_yesterday: toNumber(row["Powercrete - Yesterday Sales"]),
  powercrete_ach: toNumber(row["Powercrete - Achievement %"]),
  pcc_opc_target: toNumber(row["PCC + OPC - Target"]),
  pcc_opc_yesterday: toNumber(row["PCC + OPC - Yesterday Sales"]),
  pcc_opc_ach: toNumber(row["PCC + OPC - Achievement %"]),
  hwp_target: toNumber(row["HWP - Target"]),
  hwp_yesterday: toNumber(row["HWP - Yesterday Sales"]),
  hwp_ach: toNumber(row["HWP - Achievement %"]),
  hcg_target: toNumber(row["HCG - Target"]),
  hcg_yesterday: toNumber(row["HCG - Yesterday Sales"]),
  hcg_ach: toNumber(row["HCG - Achievement %"]),
});

export const handleUpload = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const files = req.files as
    | { [field: string]: Express.Multer.File[] }
    | undefined;
  const fileA = files?.file_a?.[0];
  const fileB = files?.file_b?.[0];

  if (!fileA || !fileB) {
    res
      .status(400)
      .json({ error: "Both files (file_a and file_b) are required." });
    return;
  }

  const { upload_date } = req.body;

  if (!upload_date) {
    res.status(400).json({ error: "upload_date is required (YYYY-MM-DD)" });
    // Security: still clean up the two files multer already wrote to disk
    await Promise.all(
      [fileA.path, fileB.path].map((p) =>
        fs.promises.unlink(p).catch(() => {}),
      ),
    );
    return;
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(upload_date)) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    await Promise.all(
      [fileA.path, fileB.path].map((p) =>
        fs.promises.unlink(p).catch(() => {}),
      ),
    );
    return;
  }

  const client = await pool.connect();

  try {
    console.log(
      `Upload started: ${fileA.originalname} + ${fileB.originalname}, ` +
        `sizes: ${fileA.size} + ${fileB.size} bytes`,
    );

    // --- Forward both files to the Python merge service ---
    const form = new FormData();
    form.append("file_a", fs.createReadStream(fileA.path), fileA.originalname);
    form.append("file_b", fs.createReadStream(fileB.path), fileB.originalname);

    let mergedRows: Record<string, unknown>[];
    try {
      const mergeResponse = await axios.post(
        `${MERGE_SERVICE_URL}/api/merge`,
        form,
        {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 120_000, // large exports can take a while to parse + merge
        },
      );
      mergedRows = mergeResponse.data.rows;
    } catch (mergeErr: any) {
      // The merge service returns a clear 422 with a human-readable `detail`
      // for missing columns / unreadable files — surface that directly
      // instead of a generic error, same spirit as the old FILE_EMPTY check.
      if (mergeErr.response?.status === 422) {
        throw new Error(
          `MERGE_ERROR: ${mergeErr.response.data?.detail ?? "Could not merge the uploaded files."}`,
        );
      }
      throw new Error(
        `MERGE_SERVICE_UNREACHABLE: ${mergeErr.message ?? "Could not reach the merge service."}`,
      );
    }

    if (!mergedRows || mergedRows.length === 0) {
      throw new Error("FILE_EMPTY");
    }

    const rows: SalesRow[] = mergedRows.map(mapMergedRow);

    console.log(`Rows merged: ${rows.length}`);

    await client.query("BEGIN");

    // Delete existing rows for this date (re-upload same day)
    await client.query("DELETE FROM sales_current WHERE upload_date = $1", [
      upload_date,
    ]);

    // Bulk insert in batches to avoid PostgreSQL parameter limit (65535 max)
    // 34 params per row now (16 original + 18 new target/yesterday/ach fields)
    const COLUMNS_PER_ROW = 34;
    const BATCH_SIZE = 1000;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders = batch.map((row, idx) => {
        const base = idx * COLUMNS_PER_ROW;
        values.push(
          upload_date,
          row.sap_id,
          row.customer_name,
          row.customer_type,
          row.region,
          row.area,
          row.territory,
          row.tsm_tse,
          row.asm_kam,
          row.rsm_b2b_head,
          row.plc_mtd_sales,
          row.plc_plus_mtd_sales,
          row.powercrete_mtd_sales,
          row.pcc_opc_mtd_sales,
          row.hwp_mtd_sales,
          row.hcg_mtd_sales,
          row.plc_target,
          row.plc_yesterday,
          row.plc_ach,
          row.plc_plus_target,
          row.plc_plus_yesterday,
          row.plc_plus_ach,
          row.powercrete_target,
          row.powercrete_yesterday,
          row.powercrete_ach,
          row.pcc_opc_target,
          row.pcc_opc_yesterday,
          row.pcc_opc_ach,
          row.hwp_target,
          row.hwp_yesterday,
          row.hwp_ach,
          row.hcg_target,
          row.hcg_yesterday,
          row.hcg_ach,
        );
        const placeholderNums = Array.from(
          { length: COLUMNS_PER_ROW },
          (_, colIdx) => `$${base + colIdx + 1}`,
        );
        return `(${placeholderNums.join(",")})`;
      });

      await client.query(
        `INSERT INTO sales_current (
          upload_date, sap_id, customer_name, customer_type,
          region, area, territory, tsm_tse, asm_kam, rsm_b2b_head,
          plc_mtd_sales, plc_plus_mtd_sales, powercrete_mtd_sales, pcc_opc_mtd_sales, hwp_mtd_sales, hcg_mtd_sales,
          plc_target, plc_yesterday, plc_ach,
          plc_plus_target, plc_plus_yesterday, plc_plus_ach,
          powercrete_target, powercrete_yesterday, powercrete_ach,
          pcc_opc_target, pcc_opc_yesterday, pcc_opc_ach,
          hwp_target, hwp_yesterday, hwp_ach,
          hcg_target, hcg_yesterday, hcg_ach
        ) VALUES ${placeholders.join(",")}`,
        values,
      );
    }

    // Find months older than 4 months in sales_current
    const oldMonths = await client.query(`
      SELECT DISTINCT DATE_TRUNC('month', upload_date) AS month
      FROM sales_current
      WHERE DATE_TRUNC('month', upload_date) < DATE_TRUNC('month', NOW()) - INTERVAL '3 months'
      ORDER BY month ASC
    `);

    // Move old months to sales_archived
    if (oldMonths.rows.length > 0) {
      for (const oldMonth of oldMonths.rows) {
        const month = oldMonth.month;

        await client.query(
          `INSERT INTO sales_archived (
            upload_date, sap_id, customer_name, customer_type,
            region, area, territory, tsm_tse, asm_kam, rsm_b2b_head,
            plc_mtd_sales, plc_plus_mtd_sales, powercrete_mtd_sales, pcc_opc_mtd_sales, hwp_mtd_sales, hcg_mtd_sales,
            plc_target, plc_yesterday, plc_ach,
            plc_plus_target, plc_plus_yesterday, plc_plus_ach,
            powercrete_target, powercrete_yesterday, powercrete_ach,
            pcc_opc_target, pcc_opc_yesterday, pcc_opc_ach,
            hwp_target, hwp_yesterday, hwp_ach,
            hcg_target, hcg_yesterday, hcg_ach
          )
          SELECT
            upload_date, sap_id, customer_name, customer_type,
            region, area, territory, tsm_tse, asm_kam, rsm_b2b_head,
            plc_mtd_sales, plc_plus_mtd_sales, powercrete_mtd_sales, pcc_opc_mtd_sales, hwp_mtd_sales, hcg_mtd_sales,
            plc_target, plc_yesterday, plc_ach,
            plc_plus_target, plc_plus_yesterday, plc_plus_ach,
            powercrete_target, powercrete_yesterday, powercrete_ach,
            pcc_opc_target, pcc_opc_yesterday, pcc_opc_ach,
            hwp_target, hwp_yesterday, hwp_ach,
            hcg_target, hcg_yesterday, hcg_ach
          FROM sales_current
          WHERE DATE_TRUNC('month', upload_date) = $1`,
          [month],
        );

        await client.query(
          `DELETE FROM sales_current
          WHERE DATE_TRUNC('month', upload_date) = $1`,
          [month],
        );
      }
    }

    await client.query("COMMIT");

    console.log(
      `Upload completed: ${rows.length} rows inserted, ${oldMonths.rows.length} months archived`,
    );

    res.status(200).json({
      message: "Files merged and processed successfully",
      upload_date,
      rows_inserted: rows.length,
      months_archived: oldMonths.rows.length,
    });
  } catch (err) {
    await client.query("ROLLBACK");

    // Security: surface user-facing errors as 400, everything else as 500.
    // Never expose internal error details or stack traces to the client.
    const message = err instanceof Error ? err.message : "";
    let status = 500;
    let clientMessage = "Upload failed. Transaction rolled back.";

    if (message === "FILE_EMPTY") {
      status = 400;
      clientMessage = "The merged result was empty — check the uploaded files.";
    } else if (message.startsWith("MERGE_ERROR: ")) {
      status = 400;
      clientMessage = message.replace("MERGE_ERROR: ", "");
    } else if (message.startsWith("MERGE_SERVICE_UNREACHABLE")) {
      status = 502;
      clientMessage =
        "Could not reach the merge service. Please try again shortly.";
    }

    console.error("Upload error:", err);
    res.status(status).json({ error: clientMessage });
  } finally {
    // Always release DB connection back to pool
    client.release();
    // Security: always delete both uploaded files — prevents disk exhaustion
    // This runs whether the upload succeeded, failed merging, or failed DB insert
    await Promise.all(
      [fileA.path, fileB.path].map((p) =>
        fs.promises.unlink(p).catch(() => {}),
      ),
    );
  }
};
