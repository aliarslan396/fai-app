import type { AxiosError } from "axios"

interface ApiErrorResponse {
  message?: string
  errors?: Record<string, string[]>
  code?: string
}

/**
 * Extract a friendly error message from any error object.
 * Handles axios errors, validation errors, network errors.
 */
export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (!error) return fallback

  const err = error as AxiosError<ApiErrorResponse>

  // Network error (no response)
  if (err.code === "ERR_NETWORK" || err.message === "Network Error") {
    return "Cannot reach server. Check your connection."
  }

  if (err.code === "ECONNABORTED") {
    return "Request timed out. Please try again."
  }

  const data = err.response?.data
  const status = err.response?.status

  // Validation errors — first error message
  if (data?.errors) {
    const firstError = Object.values(data.errors)[0]?.[0]
    if (firstError) return firstError
  }

  // Server message
  if (data?.message) return data.message

  // Status-based messages
  if (status === 403) return "You don't have permission for this action."
  if (status === 404) return "Not found."
  if (status === 409) return "Conflict — this already exists."
  if (status === 422) return "Invalid data — please check the form."
  if (status === 429) return "Too many requests. Slow down."
  if (status && status >= 500) return "Server error. Try again later."

  return fallback
}

/**
 * Get all validation errors as a flat array.
 */
export function getValidationErrors(error: unknown): string[] {
  const err = error as AxiosError<ApiErrorResponse>
  const errors = err.response?.data?.errors

  if (!errors) return []

  return Object.values(errors).flat()
}
