"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { AppHeader } from "@/components/app-header"
import { TrialBanner } from "@/components/trial-banner"
import { BrandTheme } from "@/components/brand-theme"
import { useAuthStore } from "@/lib/auth-store"
import { useHasHydrated } from "@/lib/use-hydration"
import api from "@/lib/api"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const hasHydrated = useHasHydrated()
  const { token, user, fetchMe, isLoading, context } = useAuthStore()
  const fetchedOnce = useRef(false)

  useEffect(() => {
    if (!hasHydrated) return

    if (!token) {
      router.replace("/login")
      return
    }

    if (!user && !fetchedOnce.current) {
      fetchedOnce.current = true
      fetchMe()
    }
  }, [hasHydrated, token, user, fetchMe, router])

  // Periodic tenant status check (every 10s for faster suspension detection)
  useEffect(() => {
    if (context !== "tenant" || !token) return

    const check = () => {
      api.get("/auth/me").catch(() => {
        // 401 (revoked token) or 403 TENANT_INACTIVE handled by axios interceptor
      })
    }

    // Initial check on mount + interval
    check()
    const interval = setInterval(check, 60_000)

    // Also check on tab focus (user comes back to tab)
    const onFocus = () => check()
    window.addEventListener("focus", onFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener("focus", onFocus)
    }
  }, [context, token])

  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!token) return null

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <BrandTheme />
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppHeader />
        <TrialBanner />
        <main className="flex-1 overflow-y-auto bg-muted/40 p-6">{children}</main>
      </div>
    </div>
  )
}
