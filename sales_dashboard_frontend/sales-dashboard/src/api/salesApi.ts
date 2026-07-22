import http from "./axios"

export interface FilterParams {
  date?: string
  start_date?: string
  end_date?: string
  region?: string
  area?: string
  territory?: string
  tsm_tse?: string
  asm_kam?: string
  rsm?: string
  customer?: string
  product?: string
}

export interface EmailRecipient {
  id: number
  email: string
  label: string | null
  created_at: string
}

export const salesApi = {
  // ── Auth ────────────────────────────────────────────────────────────────────

  login: (email: string, password: string) =>
    http.post("/api/auth/login", { email, password }),

  register: (name: string, email: string, password: string) =>
    http.post("/api/auth/register", { name, email, password }),

  // ── Dates ───────────────────────────────────────────────────────────────────
  // GET /api/sales/dates → getAvailableDates
  // Returns: { dates: string[] }

  getDates: () => http.get("/api/sales/dates"),

  // ── Filters ─────────────────────────────────────────────────────────────────
  // GET /api/sales/filter-options → getFilterOptions
  // Returns: { date_used, counts, options: { regions, areas, territories,
  //            tsm_tse, asm_kam, rsm_b2b_head, customers } }

  getFilterOptions: (params: FilterParams) =>
    http.get("/api/sales/filter-options", { params }),

  // ── MTD Sales endpoints ─────────────────────────────────────────────────────

  // GET /api/sales/kpi → getKpi
  // Returns: { date_used, total_sales, total_customers, total_territories,
  //            avg_per_customer, top_region, lowest_region,
  //            top_product, lowest_product }
  getKpi: (params: FilterParams) => http.get("/api/sales/kpi", { params }),

  // GET /api/sales/by-region → getByRegion
  // Returns: { date_used, data: [{ region, plc_mtd_sales, plc_plus_mtd_sales,
  //            powercrete_mtd_sales, pcc_opc_mtd_sales, hwp_mtd_sales,
  //            hcg_mtd_sales, total }] }
  getByRegion: (params: FilterParams) =>
    http.get("/api/sales/by-region", { params }),

  // GET /api/sales/by-customer-type → getByCustomerType
  // Returns: { date_used, grand_total, data: [{ customer_type, plc_mtd_sales,
  //            plc_plus_mtd_sales, powercrete_mtd_sales, pcc_opc_mtd_sales,
  //            hwp_mtd_sales, hcg_mtd_sales, total, pct }] }
  getByCustomerType: (params: FilterParams) =>
    http.get("/api/sales/by-customer-type", { params }),

  // GET /api/sales/by-product → getByProduct
  // Returns: { date_used, total, data: [{ name, value, pct }] }
  // name values: "PLC", "PLC+", "Powercrete", "PCC + OPC", "HWP", "HCG"
  getByProduct: (params: FilterParams) =>
    http.get("/api/sales/by-product", { params }),

  // GET /api/sales/mtd-target-by-product → getMtdTargetByProduct
  // Returns: { date_used, total_mtd_sales, total_target,
  //            overall_achievement_pct,
  //            data: [{ key, name, mtd_sales, target, achievement_pct }] }
  // Sorted worst achievement first.
  getMtdTargetByProduct: (params: FilterParams) =>
    http.get("/api/sales/mtd-target-by-product", { params }),

  // GET /api/sales/region-product-heatmap → getRegionProductHeatmap
  // Returns: { date_used, data: [{ region, plc_mtd_sales, plc_plus_mtd_sales,
  //            powercrete_mtd_sales, pcc_opc_mtd_sales, hwp_mtd_sales,
  //            hcg_mtd_sales, total }] }
  getHeatmap: (params: FilterParams) =>
    http.get("/api/sales/region-product-heatmap", { params }),

  // GET /api/sales/by-area → getByArea
  // Returns: { date_used, data: [{ area, region, plc_mtd_sales,
  //            plc_plus_mtd_sales, powercrete_mtd_sales, pcc_opc_mtd_sales,
  //            hwp_mtd_sales, hcg_mtd_sales, total }] }
  getByArea: (params: FilterParams) =>
    http.get("/api/sales/by-area", { params }),

  // GET /api/sales/by-territory → getByTerritory
  // Returns: { date_used, data: [{ territory, region, area, plc_mtd_sales,
  //            plc_plus_mtd_sales, powercrete_mtd_sales, pcc_opc_mtd_sales,
  //            hwp_mtd_sales, hcg_mtd_sales, total }] }
  getByTerritory: (params: FilterParams) =>
    http.get("/api/sales/by-territory", { params }),

  // GET /api/sales/customers → getCustomers
  // Returns: { date_used, total_customers, grand_total, top5, bottom5,
  //            data: [{ customer_name, region, area, territory, tsm_tse,
  //            asm_kam, rsm_b2b_head, plc_mtd_sales, ..., total, pct_share }] }
  getCustomers: (params: FilterParams) =>
    http.get("/api/sales/customers", { params }),

  // GET /api/sales/insights → getInsights
  // Returns: { date_used, best_region, worst_region, weakest_territory,
  //            top_customer, lowest_customer, most_sold_product,
  //            least_sold_product, product_dependency }
  getInsights: (params: FilterParams) =>
    http.get("/api/sales/insights", { params }),

  // GET /api/sales/insights/deep → getDeepInsights
  // Returns: { date_used, failures, performers, opportunities, risks,
  //            efficiency }
  getDeepInsights: (params: FilterParams) =>
    http.get("/api/sales/insights/deep", { params }),

  // ── D-1 Yesterday / Daily report endpoints ──────────────────────────────────

  // GET /api/sales/yesterday/kpi → getYesterdayKpi
  // Returns: { date_used, total_yesterday_sales, total_target,
  //            achievement_pct, total_customers, total_territories,
  //            avg_per_customer, top_region, lowest_region,
  //            top_product, lowest_product }
  getYesterdayKpi: (params: FilterParams) =>
    http.get("/api/sales/yesterday/kpi", { params }),

  // GET /api/sales/yesterday/by-region → getYesterdayByRegion
  // Returns: { date_used, data: [{ region, plc_mtd_sales, ..., hcg_mtd_sales,
  //            total_yesterday, total_target, achievement_pct }] }
  // Note: controller aliases yesterday cols as *_mtd_sales for frontend compat
  getYesterdayByRegion: (params: FilterParams) =>
    http.get("/api/sales/yesterday/by-region", { params }),

  // GET /api/sales/yesterday/by-product → getYesterdayByProduct
  // Returns: { date_used, total_yesterday,
  //            data: [{ name, value, target, achievement_pct, pct_of_total }] }
  getYesterdayByProduct: (params: FilterParams) =>
    http.get("/api/sales/yesterday/by-product", { params }),

  // GET /api/sales/yesterday/by-territory → getYesterdayByTerritory
  // Returns: { date_used, data: [{ territory, region, area,
  //            total_yesterday, total_target, achievement_pct }] }
  getYesterdayByTerritory: (params: FilterParams) =>
    http.get("/api/sales/yesterday/by-territory", { params }),

  // GET /api/sales/yesterday/customers → getYesterdayCustomers
  // Returns: { date_used, total_customers, grand_total_yesterday,
  //            top5, bottom5, data: [{ customer_name, region, area,
  //            territory, tsm_tse, asm_kam, rsm_b2b_head,
  //            total_yesterday, total_target, achievement_pct, pct_share }] }
  getYesterdayCustomers: (params: FilterParams) =>
    http.get("/api/sales/yesterday/customers", { params }),

  // ── Email ───────────────────────────────────────────────────────────────────

  // POST /api/email/send
  sendDashboardEmail: (payload: {
    to: string[]
    cc?: string
    date: string
    charts?: { name: string; base64: string }[]
  }) => http.post("/api/email/send", payload),

  // ── Saved email recipients (admin only) ─────────────────────────────────────

  getEmailRecipients: () =>
    http.get<{ recipients: EmailRecipient[] }>("/api/email-recipients"),

  addEmailRecipient: (email: string, label?: string) =>
    http.post("/api/email-recipients", { email, label }),

  deleteEmailRecipient: (id: number) =>
    http.delete(`/api/email-recipients/${id}`),

  // ── File upload ─────────────────────────────────────────────────────────────

  // POST /api/upload (multipart: file_a, file_b, upload_date)
  uploadFiles: async (fileA: File, fileB: File, uploadDate: string) => {
    const MAX_SIZE = 70 * 1024 * 1024 // 70 MB

    const validateFile = async (file: File, label: string): Promise<void> => {
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        throw new Error(`${label}: only .xlsx files are allowed.`)
      }
      if (file.size > MAX_SIZE) {
        throw new Error(`${label}: file size must be under 70 MB.`)
      }
      // Verify real XLSX magic bytes (PK zip header 50 4B 03 04)
      const buffer = await file.slice(0, 8).arrayBuffer()
      const hex = Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
      if (!hex.startsWith("504b0304")) {
        throw new Error(`${label}: file is not a valid XLSX file.`)
      }
    }

    await validateFile(fileA, "First file")
    await validateFile(fileB, "Second file")

    if (!/^\d{4}-\d{2}-\d{2}$/.test(uploadDate)) {
      throw new Error("Invalid date format. Use YYYY-MM-DD.")
    }

    const formData = new FormData()
    formData.append("file_a", fileA)
    formData.append("file_b", fileB)
    formData.append("upload_date", uploadDate)
    return http.post("/api/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  },
}
