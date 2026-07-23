// ─────────────────────────────────────────────────────────────────────────
// PRODUCT COLORS — edit the hex values below. That's it.
// Every chart in the dashboard imports from this file, so changing a color
// here changes it everywhere at once.
// ─────────────────────────────────────────────────────────────────────────

export const PRODUCT_COLORS = {
  PLC: "#008037", // Supercrete
  "PLC+": "#d01e2799", // Supercrete Plus
  POW: "#e2e60d99", // Powercrete
  HOLCIM: "#ef060e", // Holcim (PCC + OPC)
  HWP: "#1E3C72", // Holcim Water Protect
  HCG: "#0090C8", // Holcim Coastal Guard
}

export const PRODUCT_LABELS = {
  PLC: "Supercrete",
  "PLC+": "Supercrete Plus",
  POW: "Powercrete",
  HOLCIM: "Holcim",
  HWP: "HWP",
  HCG: "HCG",
}

// Internal *_mtd_sales column name for each product — used by charts that
// read stacked bar data (AreaChart, CustomerTypeProductChart).
export const PRODUCT_DATA_KEYS = {
  PLC: "plc_mtd_sales",
  "PLC+": "plc_plus_mtd_sales",
  POW: "powercrete_mtd_sales",
  HOLCIM: "pcc_opc_mtd_sales",
  HWP: "hwp_mtd_sales",
  HCG: "hcg_mtd_sales",
}

export type ProductCode = keyof typeof PRODUCT_COLORS

export const PRODUCT_CODES: ProductCode[] = [
  "PLC",
  "PLC+",
  "POW",
  "HOLCIM",
  "HWP",
  "HCG",
]

// Fallback color used only if a product's slot above is left blank ("").
const FALLBACK_COLOR = "#94a3b8"

// Every alternate spelling/short-code/display-name/internal-column-name the
// different API endpoints use for the same product, mapped to the
// PRODUCT_CODES above. This is what lets you key PRODUCT_COLORS by the
// short code ("PLC") while charts look products up by whatever format
// their particular endpoint happens to return.
const ALIASES: Record<string, ProductCode> = {
  // short codes (themselves)
  plc: "PLC",
  "plc+": "PLC+",
  pow: "POW",
  holcim: "HOLCIM",
  hwp: "HWP",
  hcg: "HCG",

  // internal *_mtd_sales column names
  plc_mtd_sales: "PLC",
  plc_plus_mtd_sales: "PLC+",
  powercrete_mtd_sales: "POW",
  pcc_opc_mtd_sales: "HOLCIM",
  hwp_mtd_sales: "HWP",
  hcg_mtd_sales: "HCG",

  // full display names / variants seen across the codebase
  supercrete: "PLC",
  "supercrete +": "PLC+",
  "supercrete plus": "PLC+",
  plc_plus: "PLC+",
  powercrete: "POW",
  "holcim ss": "HOLCIM",
  "pcc + opc": "HOLCIM",
  pcc_opc: "HOLCIM",
  "holcim water protect": "HWP",
  "holcim coastal guard": "HCG",
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ")
}

/** Resolve any short code / display name / internal column name to the canonical ProductCode. */
export function resolveProductCode(
  raw: string | null | undefined
): ProductCode | null {
  if (!raw) return null
  return ALIASES[normalize(raw)] ?? null
}

/** Get the color for a product, from ANY format (short code, display name, internal key). */
export function getProductColor(raw: string | null | undefined): string {
  const code = resolveProductCode(raw)
  const color = code ? PRODUCT_COLORS[code] : ""
  return color || FALLBACK_COLOR
}

/** Get the display label for a product, from ANY format. */
export function getProductLabel(raw: string | null | undefined): string {
  const code = resolveProductCode(raw)
  return code ? PRODUCT_LABELS[code] : (raw ?? "")
}
