import axios from "axios"
import axiosRetry from "axios-retry"
import rateLimit from "axios-rate-limit"
import DOMPurify from "dompurify"

const BASE_URL = ""

// Memory-only token store (never localStorage/cookies)
let authToken: string | null = null

export const setAuthToken = (token: string | null) => {
  authToken = token
}

export const getAuthToken = () => authToken

// Create axios instance
const http = rateLimit(
  axios.create({
    baseURL: BASE_URL,
    timeout: 150000,
    headers: { "Content-Type": "application/json" },
  }),
  { maxRequests: 20, perMilliseconds: 1000 }
)

// Retry logic
// NOTE: timeouts are intentionally excluded from retries — some endpoints
// (e.g. email sending) are slow by design and a timeout does NOT mean the
// request failed server-side. Retrying would cause duplicate emails.
axiosRetry(http, {
  retries: 10,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Never retry on timeout — the request may have already succeeded
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
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`
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
      authToken = null
      window.location.href = "/login"
    }
    return Promise.reject(error)
  }
)

export default http
