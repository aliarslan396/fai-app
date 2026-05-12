"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/lib/auth-store"
import { applyPrimaryColor } from "@/lib/color"

/**
 * Applies tenant primary color as CSS variable on root.
 * Used inside authenticated app shell.
 */
export function BrandTheme() {
  const { tenant, context } = useAuthStore()

  useEffect(() => {
    if (context !== "tenant" || !tenant?.primary_color) {
      applyPrimaryColor(null)
      return
    }
    applyPrimaryColor(tenant.primary_color)
  }, [tenant?.primary_color, context])

  return null
}
