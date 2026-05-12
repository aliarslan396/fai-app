import axios, { AxiosError } from "axios"
import { toast } from "sonner"
import { useAuthStore } from "./auth-store"
import { getApiBaseUrl } from "./tenant"

interface ApiError {
  message?: string
  code?: string
  tenant_status?: string
}

export const api = axios.create({
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
})

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    config.baseURL = getApiBaseUrl()

    // Don't overwrite explicit Authorization header (e.g. MFA challenge token).
    // AxiosHeaders normalizes case, so check both forms.
    const hasExplicitAuth =
      config.headers?.has?.("Authorization") ||
      config.headers?.has?.("authorization") ||
      !!(config.headers as Record<string, unknown>)?.Authorization ||
      !!(config.headers as Record<string, unknown>)?.authorization

    if (!hasExplicitAuth) {
      const state = useAuthStore.getState()
      if (state.token) {
        config.headers.Authorization = `Bearer ${state.token}`
      }
    }
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (typeof window === "undefined") return Promise.reject(error)

    const status = error.response?.status
    const data = error.response?.data

    // Suspended/cancelled tenant — force logout + show banner
    if (status === 403 && data?.code === "TENANT_INACTIVE") {
      const { clearAuth } = useAuthStore.getState()
      clearAuth()
      toast.error(data.message || "Workspace inactive — contact administrator")
      if (window.location.pathname !== "/login") {
        setTimeout(() => window.location.replace("/login"), 1500)
      }
      return Promise.reject(error)
    }

    // 401 → kick to login (token revoked, expired, or invalid)
    if (status === 401) {
      const state = useAuthStore.getState()
      const wasAuthenticated = state.isAuthenticated
      state.clearAuth()
      if (window.location.pathname !== "/login" && window.location.pathname !== "/signup") {
        if (wasAuthenticated) {
          toast.error("Your session ended — please sign in again")
        }
        setTimeout(() => window.location.replace("/login"), 800)
      }
    }

    return Promise.reject(error)
  }
)

export default api
