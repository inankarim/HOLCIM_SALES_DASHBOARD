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
  // Get available dates
  getDates: () => http.get("/api/sales/dates"),

  login: (email: string, password: string) =>
    http.post("/api/auth/login", { email, password }),

  register: (name: string, email: string, password: string) =>
    http.post("/api/auth/register", { name, email, password }),

  // Get filter options (cascading)
  getFilterOptions: (params: FilterParams) =>
    http.get("/api/sales/filter-options", { params }),

  // Get KPIs
  getKpi: (params: FilterParams) => http.get("/api/sales/kpi", { params }),

  // Get sales by region
  getByRegion: (params: FilterParams) =>
    http.get("/api/sales/by-region", { params }),

  // Get sales by product
  getByProduct: (params: FilterParams) =>
    http.get("/api/sales/by-product", { params }),

  // Get region product heatmap
  getHeatmap: (params: FilterParams) =>
    http.get("/api/sales/region-product-heatmap", { params }),

  // Get sales by area
  getByArea: (params: FilterParams) =>
    http.get("/api/sales/by-area", { params }),

  // Get sales by territory
  getByTerritory: (params: FilterParams) =>
    http.get("/api/sales/by-territory", { params }),

  // Get customer data
  getCustomers: (params: FilterParams) =>
    http.get("/api/sales/customers", { params }),

  // Get insights
  getInsights: (params: FilterParams) =>
    http.get("/api/sales/insights", { params }),

  // Get deep insights
  getDeepInsights: (params: FilterParams) =>
    http.get("/api/sales/insights/deep", { params }),

  // Send dashboard email
  sendDashboardEmail: (payload: {
    to: string[]
    cc?: string
    date: string
    charts?: { name: string; base64: string }[]
  }) => http.post("/api/email/send", payload),

  // Saved email recipients (admin only)
  getEmailRecipients: () =>
    http.get<{ recipients: EmailRecipient[] }>("/api/email-recipients"),

  addEmailRecipient: (email: string, label?: string) =>
    http.post("/api/email-recipients", { email, label }),

  deleteEmailRecipient: (id: number) =>
    http.delete(`/api/email-recipients/${id}`),

  // Upload file
  // Upload file with security checks
  uploadFile: async (file: File, uploadDate: string) => {
    // 1. Check file extension
    const allowedExtensions = [".csv", ".xlsx"]
    const fileName = file.name.toLowerCase()
    const hasValidExt = allowedExtensions.some((ext) => fileName.endsWith(ext))
    if (!hasValidExt) {
      return Promise.reject(new Error("Only CSV or XLSX files are allowed."))
    }

    // 2. Check file size (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return Promise.reject(new Error("File size must be under 10MB."))
    }

    // 3. Check magic bytes (real file signature)
    const buffer = await file.slice(0, 8).arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")

    const isXLSX = hex.startsWith("504b0304")

    if (fileName.endsWith(".xlsx") && !isXLSX) {
      return Promise.reject(new Error("File is not a valid XLSX file."))
    }

    // 4. If CSV, validate required columns exist
    if (fileName.endsWith(".csv")) {
      const text = await file.slice(0, 2000).text()
      const firstLine = text
        .split("\n")[0]
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/['"]/g, "")
      const requiredColumns = [
        "customer_name",
        "region",
        "area",
        "territory",
        "plc",
      ]
      const missingCols = requiredColumns.filter(
        (col) => !firstLine.includes(col)
      )
      if (missingCols.length > 0) {
        return Promise.reject(
          new Error(`Missing required columns: ${missingCols.join(", ")}`)
        )
      }
    }

    // 5. Validate date format
    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    if (!datePattern.test(uploadDate)) {
      return Promise.reject(new Error("Invalid date format. Use YYYY-MM-DD."))
    }

    const formData = new FormData()
    formData.append("file", file)
    formData.append("upload_date", uploadDate)
    return http.post("/api/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  },
}
