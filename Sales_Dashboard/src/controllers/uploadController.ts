import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { parseFile, SalesRow } from "../utils/fileParser";
import { pool } from "../config/db";
import fs from "fs";

export const handleUpload = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const { upload_date } = req.body;

  if (!upload_date) {
    res.status(400).json({ error: "upload_date is required (YYYY-MM-DD)" });
    return;
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(upload_date)) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    return;
  }

  const client = await pool.connect();

  try {
    console.log(
      `Upload started: ${req.file.originalname}, size: ${req.file.size} bytes`,
    );

    // Parse the uploaded file
    const rows: SalesRow[] = await parseFile(req.file.path);

    // Security: throw instead of early return so finally block handles cleanup
    if (rows.length === 0) {
      throw new Error("FILE_EMPTY");
    }

    console.log(`Rows parsed: ${rows.length}`);

    await client.query("BEGIN");

    // Delete existing rows for this date (re-upload same day)
    await client.query("DELETE FROM sales_current WHERE upload_date = $1", [
      upload_date,
    ]);

    // Bulk insert in batches to avoid PostgreSQL parameter limit (65535 max)
    const BATCH_SIZE = 1000;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders = batch.map((row, idx) => {
        const base = idx * 16;
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
          row.plc,
          row.plc_plus,
          row.pow,
          row.holcim_ss,
          row.hwp,
          row.hcg,
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16})`;
      });

      await client.query(
        `INSERT INTO sales_current (
          upload_date, sap_id, customer_name, customer_type,
          region, area, territory, tsm_tse, asm_kam, rsm_b2b_head,
          plc, plc_plus, pow, holcim_ss, hwp, hcg
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
            plc, plc_plus, pow, holcim_ss, hwp, hcg
          )
          SELECT
            upload_date, sap_id, customer_name, customer_type,
            region, area, territory, tsm_tse, asm_kam, rsm_b2b_head,
            plc, plc_plus, pow, holcim_ss, hwp, hcg
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
      message: "File uploaded and processed successfully",
      upload_date,
      rows_inserted: rows.length,
      months_archived: oldMonths.rows.length,
    });
  } catch (err) {
    await client.query("ROLLBACK");

    // Security: surface user errors as 400, everything else as 500
    // Never expose internal error details or stack traces to the client
    const isUserError = err instanceof Error && err.message === "FILE_EMPTY";
    const status = isUserError ? 400 : 500;
    const message = isUserError
      ? "File is empty or could not be parsed"
      : "Upload failed. Transaction rolled back.";

    console.error("Upload error:", err);
    res.status(status).json({ error: message });
  } finally {
    // Always release DB connection back to pool
    client.release();
    // Security: always delete uploaded file — prevents disk exhaustion
    // This runs whether the upload succeeded, failed parsing, or failed DB insert
    if (req.file?.path) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }
  }
};
