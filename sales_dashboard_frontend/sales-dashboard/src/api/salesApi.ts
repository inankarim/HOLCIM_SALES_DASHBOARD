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

  // Get MTD sales vs target per product, with achievement %
  getMtdTargetByProduct: (params: FilterParams) =>
    http.get("/api/sales/mtd-target-by-product", { params }),

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
  // Upload both source files with security checks
  uploadFiles: async (fileA: File, fileB: File, uploadDate: string) => {
    const MAX_SIZE = 70 * 1024 * 1024 // 10MB

    const validateFile = async (file: File, label: string): Promise<void> => {
      // 1. Check file extension — only .xlsx for the two-file merge flow
      const fileName = file.name.toLowerCase()
      if (!fileName.endsWith(".xlsx")) {
        throw new Error(`${label}: only .xlsx files are allowed.`)
      }

      // 2. Check file size
      if (file.size > MAX_SIZE) {
        throw new Error(`${label}: file size must be under 10MB.`)
      }

      // 3. Check magic bytes (real file signature) — .xlsx is a zip archive,
      // so its first 4 bytes are always the zip signature 50 4B 03 04.
      const buffer = await file.slice(0, 8).arrayBuffer()
      const bytes = new Uint8Array(buffer)
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
      const isXLSX = hex.startsWith("504b0304")

      if (!isXLSX) {
        throw new Error(`${label}: file is not a valid XLSX file.`)
      }
    }

    try {
      await validateFile(fileA, "First file")
      await validateFile(fileB, "Second file")
    } catch (err) {
      return Promise.reject(err)
    }

    // 4. Validate date format
    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    if (!datePattern.test(uploadDate)) {
      return Promise.reject(new Error("Invalid date format. Use YYYY-MM-DD."))
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
