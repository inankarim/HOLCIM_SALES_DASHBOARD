import axios from "axios"
import axiosRetry from "axios-retry"
import rateLimit from "axios-rate-limit"
import DOMPurify from "dompurify"

const BASE_URL = ""
const TOKEN_KEY = "auth_token"

// sessionStorage: survives page reloads/direct URL entry within the same
// tab (unlike a plain JS variable), but is cleared when the tab closes and
// is never shared across tabs or persisted like localStorage — a smaller
// security tradeoff than localStorage, in exchange for not silently
// breaking every reload/refresh during normal use.
export const setAuthToken = (token: string | null) => {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token)
  } else {
    sessionStorage.removeItem(TOKEN_KEY)
  }
}

export const getAuthToken = () => sessionStorage.getItem(TOKEN_KEY)

// Create axios instance
const http = rateLimit(
  axios.create({
    baseURL: BASE_URL,
    timeout: 150000,
    headers: { "Content-Type": "application/json" },
  }),
  { maxRequests: 20, perMilliseconds: 1000 }
)

axiosRetry(http, {
  retries: 10,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      return false
    }
    return (
      axiosRetry.isNetworkError(error) ||
      [502, 503, 504].includes(error.response?.status ?? 0)
    )
  },
})

// Request interceptor - inject token + sanitize
http.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // FormData uploads (file_a/file_b, target file) must NOT carry the
  // instance-level "application/json" default set above — that default
  // header survives even when the call site never sets Content-Type
  // itself, and it causes express.json() on the server to try to
  // JSON.parse the multipart body, returning a bare 400 before multer
  // ever runs. Deleting it here lets the browser set its own
  // "multipart/form-data; boundary=..." header.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"]
  }

  if (config.params) {
    Object.keys(config.params).forEach((key) => {
      if (typeof config.params[key] === "string") {
        config.params[key] = DOMPurify.sanitize(config.params[key])
      }
    })
  }
  return config
})

// Response interceptor - handle 401
http.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      setAuthToken(null)
      window.location.href = "/login"
    }
    return Promise.reject(error)
  }
)

export default http
