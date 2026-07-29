import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { pool } from "../config/db";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";

// Same process/port as the sales merge service — /api/targets lives
// inside app.py alongside /api/merge*.
const TARGET_SERVICE_URL =
  process.env.MERGE_SERVICE_URL ?? "http://sales-summary-service:8000";

interface TargetRow {
  region: string;
  area: string;
  territory: string;
  tsm_tse: string;
  customer_type: string;
  brand: string;
  target_value: number;
}

interface TargetServiceResponse {
  target_month: string;
  row_count: number;
  skipped_non_target_rows: number;
  rows: TargetRow[];
}

export const handleTargetUpload = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "A target file is required." });
    return;
  }

  const { target_month } = req.body;

  const cleanupUpload = () => fs.promises.unlink(file.path).catch(() => {});

  if (!target_month || !/^\d{4}-\d{2}-01$/.test(target_month)) {
    res.status(400).json({ error: "target_month is required as YYYY-MM-01." });
    await cleanupUpload();
    return;
  }

  // Security: never allow a future month.
  const now = new Date();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  if (target_month > currentMonthStart) {
    res.status(400).json({ error: "target_month cannot be in the future." });
    await cleanupUpload();
    return;
  }

  const client = await pool.connect();

  try {
    const form = new FormData();
    form.append("file", fs.createReadStream(file.path), file.originalname);
    form.append("target_month", target_month);

    let payload: TargetServiceResponse;
    try {
      const resp = await axios.post(`${TARGET_SERVICE_URL}/api/targets`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60_000,
      });
      payload = resp.data;
    } catch (err: any) {
      if (err.response?.status === 422) {
        throw new Error(
          `PARSE_ERROR: ${err.response.data?.detail ?? "Could not parse the target file."}`,
        );
      }
      throw new Error(
        `TARGET_SERVICE_UNREACHABLE: ${err.message ?? "Could not reach the target parsing service."}`,
      );
    }

    if (!payload.rows || payload.rows.length === 0) {
      throw new Error("FILE_EMPTY");
    }

    await client.query("BEGIN");

    // 8 params per row: target_month + 6 group columns + target_value.
    const COLUMNS_PER_ROW = 8;
    const BATCH_SIZE = 1000;
    for (let i = 0; i < payload.rows.length; i += BATCH_SIZE) {
      const batch = payload.rows.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders = batch.map((row, idx) => {
        const base = idx * COLUMNS_PER_ROW;
        values.push(
          target_month,
          row.region,
          row.area,
          row.territory,
          row.tsm_tse,
          row.customer_type,
          row.brand,
          row.target_value,
        );
        const nums = Array.from(
          { length: COLUMNS_PER_ROW },
          (_, c) => `$${base + c + 1}`,
        );
        return `(${nums.join(",")})`;
      });

      await client.query(
        `INSERT INTO sales_targets (
           target_month, region, area, territory, tsm_tse, customer_type, brand, target_value
         ) VALUES ${placeholders.join(",")}
         ON CONFLICT (target_month, region, area, territory, tsm_tse, customer_type, brand)
         DO UPDATE SET target_value = EXCLUDED.target_value, uploaded_at = NOW()`,
        values,
      );
    }

    await client.query("COMMIT");

    res.status(200).json({
      message: "Target file processed successfully",
      target_month,
      rows_inserted: payload.row_count,
      skipped_non_target_rows: payload.skipped_non_target_rows,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    const message = err instanceof Error ? err.message : "";
    let status = 500;
    let clientMessage = "Target upload failed. Transaction rolled back.";

    if (message === "FILE_EMPTY") {
      status = 400;
      clientMessage = "The parsed target file had no rows.";
    } else if (message.startsWith("PARSE_ERROR: ")) {
      status = 400;
      clientMessage = message.replace("PARSE_ERROR: ", "");
    } else if (message.startsWith("TARGET_SERVICE_UNREACHABLE")) {
      status = 502;
      clientMessage =
        "Could not reach the target parsing service. Please try again shortly.";
    }

    console.error("Target upload error:", err);
    res.status(status).json({ error: clientMessage });
  } finally {
    client.release();
    await cleanupUpload();
  }
};

export const handleCheckTargetMonth = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { target_month } = req.query;

  if (
    typeof target_month !== "string" ||
    !/^\d{4}-\d{2}-01$/.test(target_month)
  ) {
    res.status(400).json({ error: "target_month is required as YYYY-MM-01." });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS row_count FROM sales_targets WHERE target_month = $1",
      [target_month],
    );
    const rowCount = result.rows[0]?.row_count ?? 0;
    res.status(200).json({ exists: rowCount > 0, row_count: rowCount });
  } catch (err) {
    console.error("Target month check error:", err);
    res
      .status(500)
      .json({ error: "Could not check existing targets for this month." });
  }
};
