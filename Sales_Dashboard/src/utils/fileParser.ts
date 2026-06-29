import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import * as XLSX from "xlsx";

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
  plc: number;
  plc_plus: number;
  pow: number;
  holcim_ss: number;
  hwp: number;
  hcg: number;
}

const REQUIRED_COLUMNS = [
  "SAP ID",
  "Customer Name",
  "Customer Type",
  "Region",
  "Area",
  "Territory",
  "TSM/TSE",
  "ASM/KAM",
  "RSM/B2B Head",
  "PLC",
  "PLC+",
  "POW",
  "Holcim SS",
  "HWP",
  "HCG",
];

const validateHeaders = (headers: string[]): void => {
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());

  const missing = REQUIRED_COLUMNS.filter(
    (req) => !normalizedHeaders.includes(req.toLowerCase()),
  );

  if (missing.length > 0) {
    throw new Error(
      `Invalid file format. Missing columns: ${missing.join(", ")}`,
    );
  }
};

const normalizeRow = (row: any): SalesRow => {
  return {
    sap_id: parseInt(row["SAP ID"]) || 0,
    customer_name: row["Customer Name"]?.trim() || "",
    customer_type: row["Customer Type"]?.trim() || "",
    region: row["Region"]?.trim() || "",
    area: row["Area"]?.trim() || "",
    territory: row["Territory"]?.trim() || "",
    tsm_tse: row["TSM/TSE"]?.trim() || "",
    asm_kam: row["ASM/KAM"]?.trim() || "",
    rsm_b2b_head: row["RSM/B2B Head"]?.trim() || "",
    plc: parseFloat(row["PLC"]?.toString().replace(/,/g, "")) || 0,
    plc_plus: parseFloat(row["PLC+"]?.toString().replace(/,/g, "")) || 0,
    pow: parseFloat(row["POW"]?.toString().replace(/,/g, "")) || 0,
    holcim_ss: parseFloat(row["Holcim SS"]?.toString().replace(/,/g, "")) || 0,
    hwp: parseFloat(row["HWP"]?.toString().replace(/,/g, "")) || 0,
    hcg: parseFloat(row["HCG"]?.toString().replace(/,/g, "")) || 0,
  };
};

export const parseCSV = (filePath: string): Promise<SalesRow[]> =>
  new Promise((resolve, reject) => {
    const results: SalesRow[] = [];
    let headersValidated = false;
    let rejected = false; // Guard to prevent calling reject() twice

    // Security: hold a reference so we can destroy the stream on header failure
    const fileStream = fs.createReadStream(filePath);

    fileStream
      .pipe(csvParser())
      .on("headers", (headers: string[]) => {
        try {
          validateHeaders(headers);
          headersValidated = true;
        } catch (err) {
          rejected = true;
          fileStream.destroy(); // Security: stop reading immediately — no point processing rows if headers are wrong
          reject(err);
        }
      })
      .on("data", (row) => {
        if (!headersValidated || rejected) return;
        results.push(normalizeRow(row));
      })
      .on("end", () => {
        if (!headersValidated || rejected) return;

        const MAX_ROWS = parseInt(process.env.MAX_UPLOAD_ROWS ?? "50000", 10);
        if (results.length > MAX_ROWS) {
          return reject(
            new Error(`File exceeds maximum row limit of ${MAX_ROWS}`),
          );
        }

        resolve(results);
      })
      .on("error", (err) => {
        // Security: fileStream.destroy() triggers an 'error' event with an
        // ERR_STREAM_DESTROYED code — ignore it since we already rejected above
        if (rejected) return;
        reject(err);
      });
  });

export const parseXLSX = (filePath: string): SalesRow[] => {
  const workbook = XLSX.readFile(filePath);

  // Security: reject workbooks with no sheets (corrupted or adversarial files)
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("No worksheets found");
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    throw new Error("No worksheets found");
  }

  const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (raw.length === 0) {
    throw new Error("File is empty");
  }

  // Security: prevent memory exhaustion from huge files
  const MAX_ROWS = parseInt(process.env.MAX_UPLOAD_ROWS ?? "50000", 10);
  if (raw.length > MAX_ROWS) {
    throw new Error(`File exceeds maximum row limit of ${MAX_ROWS}`);
  }

  // Validate headers from first row keys
  const headers = Object.keys(raw[0] as object);
  validateHeaders(headers);

  return raw.map(normalizeRow);
};

export const parseFile = async (filePath: string): Promise<SalesRow[]> => {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv") {
    return await parseCSV(filePath);
  } else if (ext === ".xlsx" || ext === ".xls") {
    return parseXLSX(filePath);
  } else {
    throw new Error("Unsupported file type. Only .csv and .xlsx are allowed");
  }
};
